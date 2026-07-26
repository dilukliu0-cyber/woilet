// Supabase Edge Function: shopping-insights
//
// «Живое» ИИ-сообщение для вкладки «Покупки» → «Умный»: вместо сухих карточек
// Gemini коротко и по-человечески пересказывает уже посчитанные клиентом
// прогнозы (runningOut/suggestions — чистая арифметика по датам покупок,
// без ИИ). Кэшируется на INSIGHT_INTERVAL, чтобы открытие вкладки не било по
// кошельку при каждом тапе (§2.1).
//
// Deploy: supabase functions deploy shopping-insights
// Secret: тот же GEMINI_API_KEY, что и у остальных функций.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getEntitlement, proRequiredResponse } from '../_shared/entitlement.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const INSIGHT_INTERVAL_MS = 12 * 60 * 60 * 1000;

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
    if (!authHeader) return jsonResponse({ error: 'Не авторизовано' }, 401);

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
    if (userError || !user) return jsonResponse({ error: 'Не авторизовано' }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Советы по покупкам — ИИ-функция, значит Pro. Проверяем до чтения кэша:
    // иначе отписавшийся пользователь продолжал бы получать старый ответ.
    const entitlement = await getEntitlement(serviceClient, user.id);
    if (!entitlement.isPro) return proRequiredResponse(CORS_HEADERS);

    const { runningOut, suggestions } = await req.json();
    const hasData =
      (Array.isArray(runningOut) && runningOut.length > 0) ||
      (Array.isArray(suggestions) && suggestions.length > 0);

    const { data: cached } = await userClient
      .from('shopping_insights')
      .select('message, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.created_at).getTime() < INSIGHT_INTERVAL_MS) {
      return jsonResponse({ message: cached.message, cached: true });
    }

    if (!hasData) {
      await serviceClient
        .from('shopping_insights')
        .upsert({ user_id: user.id, message: null, created_at: new Date().toISOString() });
      return jsonResponse({ message: null });
    }

    if (!geminiApiKey) return jsonResponse({ error: 'GEMINI_API_KEY не настроен на сервере' }, 500);

    const prompt = `Ты — ассистент по покупкам в приложении учёта расходов. По данным ниже (прогноз построен на реальной истории покупок пользователя, ты его НЕ придумываешь) напиши короткое дружелюбное сообщение от первого лица, 2-4 предложения, в духе:
"Я проанализировал твои покупки. Скорее всего, скоро понадобятся: • Кофе • Молоко".
Используй ТОЛЬКО товары из JSON — не добавляй ничего своего. Если один из списков пуст, просто не упоминай его.

Скоро закончится (название, через сколько дней): ${JSON.stringify(runningOut ?? [])}
Покупает регулярно (название, сколько раз): ${JSON.stringify(suggestions ?? [])}`;

    const geminiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini error', geminiResponse.status, errorText);
      return jsonResponse({ error: 'Не удалось получить рекомендации' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const message = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!message) return jsonResponse({ error: 'ИИ вернул пустой ответ' }, 502);

    await serviceClient
      .from('shopping_insights')
      .upsert({ user_id: user.id, message, created_at: new Date().toISOString() });

    const usage = geminiData.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const estimatedCost = (inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000;
    await serviceClient.from('ai_api_usage').insert({
      user_id: user.id,
      model: GEMINI_MODEL,
      kind: 'shopping',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
    });

    return jsonResponse({ message });
  } catch (error) {
    console.error('shopping-insights error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
