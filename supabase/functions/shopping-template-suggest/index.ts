// Supabase Edge Function: shopping-template-suggest
//
// Кнопка «Заполнить с помощью ИИ» при создании шаблона списка покупок:
// по названию шаблона ("Для кота", "Еженедельные покупки") и реальной
// истории покупок пользователя подбирает список товаров. В первую очередь
// берёт товары из истории, которые подходят под тему; если история пуста
// или ничего не подходит — предлагает несколько общих товаров для этой
// темы (это подсказка для стартового списка, а не финансовые данные —
// строгий запрет "не выдумывать цифры" тут неприменим, но список должен
// оставаться разумным и коротким).
//
// Deploy: supabase functions deploy shopping-template-suggest
// Secret: тот же GEMINI_API_KEY, что и у остальных функций.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getEntitlement, proRequiredResponse } from '../_shared/entitlement.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';

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
    if (!geminiApiKey) return jsonResponse({ error: 'GEMINI_API_KEY не настроен на сервере' }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Не авторизовано' }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Подсказка состава шаблона — ИИ-функция, значит Pro.
    const entitlement = await getEntitlement(serviceClient, user.id);
    if (!entitlement.isPro) return proRequiredResponse(CORS_HEADERS);

    const { name } = await req.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return jsonResponse({ error: 'name обязателен' }, 400);
    }

    const { data: items } = await userClient
      .from('receipt_items')
      .select('cleaned_name, category_name')
      .order('created_at', { ascending: false })
      .limit(400);

    const uniqueProducts = [...new Set((items ?? []).map((i) => i.cleaned_name))].slice(0, 200);

    const prompt = `Пользователь создаёт шаблон списка покупок с названием «${name.trim()}».
Вот товары, которые он реально покупал раньше (может быть пусто):
${JSON.stringify(uniqueProducts)}

Подбери список товаров для этого шаблона:
1. В первую очередь возьми товары из списка выше, которые подходят по теме названия.
2. Если подходящих мало или список покупок пуст — дополни парой обычных товаров, которые логично ожидать под таким названием (например, «Для кота» → корм, наполнитель; «Еженедельные покупки» → базовые продукты).
3. Не больше 10 товаров, без дубликатов, каждое название коротко (1-3 слова).

Ответь ТОЛЬКО JSON-массивом строк, без markdown и пояснений. Пример: ["Кофе","Молоко","Хлеб"]`;

    const geminiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini error', geminiResponse.status, errorText);
      return jsonResponse({ error: 'Не удалось получить список' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const cleaned = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let suggestedItems: string[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        suggestedItems = parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 10);
      }
    } catch {
      // Модель не вернула валидный JSON — не выдаём мусор пользователю.
      return jsonResponse({ error: 'ИИ вернул неожиданный формат, попробуйте ещё раз' }, 502);
    }

    if (suggestedItems.length === 0) {
      return jsonResponse({ error: 'ИИ не смог подобрать товары для этого названия' }, 502);
    }

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

    return jsonResponse({ items: suggestedItems });
  } catch (error) {
    console.error('shopping-template-suggest error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
