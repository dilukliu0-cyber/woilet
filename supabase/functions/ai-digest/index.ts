// Supabase Edge Function: ai-digest
//
// Раз в 2 дня (не чаще) — реальный ИИ-разбор трат пользователя вместо
// шаблонного сообщения после каждого чека. Клиент дергает эту функцию
// при каждом открытии Главной; сама функция решает, пора ли запускать
// Gemini, свеярясь с user_settings.last_ai_digest_at — так клиенту не
// нужно ничего считать самому, а лишний вызов ИИ невозможен даже при
// повторных запросах (§2.1 — без исключений для вызова AI, но и без
// лишних трат).
//
// Deploy: supabase functions deploy ai-digest
// Secret: тот же GEMINI_API_KEY, что и у scan-receipt / ai-chat.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getEntitlement } from '../_shared/entitlement.ts';
import { fetchUserLanguage, languageInstruction } from '../_shared/language.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const DIGEST_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init);
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === attempts) return response;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 3;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Не авторизовано' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Не авторизовано' }, 401);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Проактивный ИИ-разбор — функция Pro. Клиент дергает эту функцию при
    // каждом открытии Главной, поэтому на бесплатном тарифе отвечаем обычным
    // skipped (как при выключенных советах), а не ошибкой: иначе на Главной
    // при каждом входе всплывал бы отказ.
    const entitlement = await getEntitlement(serviceClient, user.id);
    if (!entitlement.isPro) {
      return jsonResponse({ skipped: true, reason: 'pro_required' });
    }

    const { data: settings } = await userClient
      .from('user_settings')
      .select('ai_tips_enabled, last_ai_digest_at, notifications_enabled, push_token')
      .eq('user_id', user.id)
      .single();

    if (settings && settings.ai_tips_enabled === false) {
      return jsonResponse({ skipped: true, reason: 'disabled' });
    }

    const lastDigestAt = settings?.last_ai_digest_at ? new Date(settings.last_ai_digest_at) : null;
    const now = new Date();
    if (lastDigestAt && now.getTime() - lastDigestAt.getTime() < DIGEST_INTERVAL_MS) {
      return jsonResponse({ skipped: true, reason: 'too_soon' });
    }

    const windowStart = lastDigestAt ?? new Date(now.getTime() - DIGEST_INTERVAL_MS);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Свежие чеки — детально; весь месяц — агрегировано (иначе токены
    // улетают на сырые списки товаров, а модель тонет в шуме).
    const [{ data: recentReceipts }, { data: monthReceipts }, { data: limits }] = await Promise.all([
      userClient
        .from('receipts')
        .select('store_name, purchase_date, total_amount, currency, receipt_items(cleaned_name, category_name, price)')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false }),
      userClient
        .from('receipts')
        .select('purchase_date, created_at, total_amount, exchange_rate, receipt_items(cleaned_name, category_name, price)')
        .gte('created_at', monthStart.toISOString()),
      userClient.from('limits').select('category_name, amount, currency').eq('user_id', user.id),
    ]);

    if (!recentReceipts || recentReceipts.length === 0) {
      // Нечего анализировать — сдвигаем метку, чтобы не проверять чаще раза в 2 дня.
      await userClient.from('user_settings').update({ last_ai_digest_at: now.toISOString() }).eq('user_id', user.id);
      return jsonResponse({ skipped: true, reason: 'no_data' });
    }

    if (!geminiApiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY не настроен на сервере' }, 500);
    }

    // Агрегаты за месяц: суммы по категориям и часто повторяющиеся покупки.
    const byCategory = new Map<string, number>();
    const itemCounts = new Map<string, number>();
    for (const r of monthReceipts ?? []) {
      const rate = (r as { exchange_rate?: number }).exchange_rate ?? 1;
      for (const item of (r as { receipt_items?: { cleaned_name: string; category_name: string; price: number }[] })
        .receipt_items ?? []) {
        byCategory.set(item.category_name, (byCategory.get(item.category_name) ?? 0) + item.price * rate);
        const key = item.cleaned_name.trim().toLowerCase();
        itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
      }
    }
    const monthByCategory = [...byCategory.entries()]
      .map(([category, total]) => ({ category, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total);
    const frequentItems = [...itemCounts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const contextSummary = {
      recentReceipts,
      monthByCategory,
      frequentItems,
      limits: limits ?? [],
    };

    const userLanguage = await fetchUserLanguage(serviceClient, user.id);

    const systemPrompt = `Ты — финансовый ассистент в приложении учёта расходов. Раз в 2 дня ты сам, без вопроса
пользователя, пишешь ему короткий разбор трат. У тебя есть: свежие чеки за ~2 дня (детально),
агрегаты за месяц по категориям, часто повторяющиеся покупки за месяц и лимиты.
Что сделать: 1) кратко — сколько и на что ушло за последние дни; 2) заметь ОДИН интересный паттерн из
месячных данных (категория тянет бюджет, часто повторяющаяся покупка, необычно крупная трата); 3) если
какой-то лимит близок или превышен — предупреди; 4) закончи одним конкретным советом, как сэкономить.
4-6 предложений, дружелюбно, без воды и без списков. Используй ТОЛЬКО данные из JSON — не выдумывай цифры.

Данные (JSON):
${JSON.stringify(contextSummary)}`;

    const geminiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + languageInstruction(userLanguage) }] }],
          generationConfig: {
            temperature: 0.4,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini error', geminiResponse.status, errorText);
      return jsonResponse({ error: 'Не удалось получить анализ' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!replyText) {
      return jsonResponse({ error: 'ИИ вернул пустой ответ' }, 502);
    }

    await userClient.from('ai_messages').insert({ user_id: user.id, role: 'assistant', content: replyText });
    await userClient.from('user_settings').update({ last_ai_digest_at: now.toISOString() }).eq('user_id', user.id);

    if (settings?.notifications_enabled !== false && settings?.push_token) {
      sendPushNotification(settings.push_token, 'Woilet', replyText).catch((error) =>
        console.error('push-notification error', error),
      );
    }

    const usage = geminiData.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const estimatedCost = (inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000;

    await serviceClient.from('ai_api_usage').insert({
      user_id: user.id,
      model: GEMINI_MODEL,
      kind: 'digest',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
    });

    return jsonResponse({ message: replyText });
  } catch (error) {
    console.error('ai-digest error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

async function sendPushNotification(pushToken: string, title: string, body: string): Promise<void> {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
