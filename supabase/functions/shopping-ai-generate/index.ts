// Supabase Edge Function: shopping-ai-generate
//
// «Сделай мне список для лазаньи» — свободный запрос от пользователя на
// экране Покупок (не привязан к шаблону): по тексту запроса ИИ составляет
// список товаров для покупки (ингредиенты блюда, сборы в поездку и т.п.).
// В отличие от shopping-template-suggest, здесь запрос произвольный текст,
// а не название категории шаблона — история покупок не используется,
// чтобы не путать модель нерелевантными товарами.
//
// Если запрос про блюдо — дополнительно возвращает краткий рецепт (шаги
// приготовления) для кнопки «Готовить» на экране Покупок.
//
// Deploy: supabase functions deploy shopping-ai-generate
// Secret: тот же GEMINI_API_KEY, что и у остальных функций.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getEntitlement, proRequiredResponse } from '../_shared/entitlement.ts';
import { fetchUserLanguage, languageInstruction } from '../_shared/language.ts';

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

    // Генерация списка через ИИ — функция Pro (сами списки остаются
    // бесплатными, платный только ИИ-помощник).
    const entitlement = await getEntitlement(serviceClient, user.id);
    if (!entitlement.isPro) return proRequiredResponse(CORS_HEADERS);

    const { query } = await req.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return jsonResponse({ error: 'query обязателен' }, 400);
    }
    const trimmedQuery = query.trim().slice(0, 200);

    const userLanguage = await fetchUserLanguage(serviceClient, user.id);

    const prompt = `Пользователь пишет в приложении для покупок запрос: «${trimmedQuery}».
Это может быть блюдо (тогда нужны ингредиенты для готовки), повод (поездка, праздник — тогда нужные вещи/продукты) или просто список того, что нужно купить.

Составь список товаров для покупки под этот запрос:
1. Если это блюдо — перечисли ингредиенты, которые реально нужно купить (без соли/воды/специй, которые почти всегда уже есть дома, если явно не указано иное).
2. Если это повод или сборы — перечисли конкретные вещи/продукты.
3. От 3 до 12 товаров, без дубликатов, каждое название коротко (1-3 слова, например «Сыр моцарелла», а не «200г тёртого сыра моцарелла»).
4. Если запрос совсем не про покупки и составить список невозможно — верни пустой массив items.
5. Если запрос — конкретное блюдо (не повод и не общий список), дополнительно составь краткий рецепт: 4-8 коротких шагов приготовления, каждый шаг — одно предложение. Если это не блюдо — верни null для recipe.

Ответь ТОЛЬКО JSON-объектом, без markdown и пояснений, строго в таком формате:
{"items": ["Лист лазаньи","Фарш говяжий","Соус бешамель","Сыр моцарелла","Помидоры"], "recipe": ["Обжарить фарш с луком до готовности","Слоями выложить листы лазаньи, фарш и соус бешамель","Посыпать сыром","Запекать 40 минут при 180°C"]}
Если это не блюдо (например «сборы на дачу»): {"items": ["Плед","Мангал","Уголь"], "recipe": null}`;

    const geminiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + languageInstruction(userLanguage) }] }],
          generationConfig: { temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini error', geminiResponse.status, errorText);
      return jsonResponse({ error: 'Не удалось составить список' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const cleaned = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let items: string[] = [];
    let recipe: string[] | null = null;
    try {
      const parsed = JSON.parse(cleaned);
      const rawItems = Array.isArray(parsed) ? parsed : parsed?.items;
      if (Array.isArray(rawItems)) {
        items = rawItems.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12);
      }
      if (!Array.isArray(parsed) && Array.isArray(parsed?.recipe)) {
        const rawRecipe = parsed.recipe.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0);
        if (rawRecipe.length > 0) recipe = rawRecipe.slice(0, 10);
      }
    } catch {
      return jsonResponse({ error: 'ИИ вернул неожиданный формат, попробуйте ещё раз' }, 502);
    }

    if (items.length === 0) {
      return jsonResponse({ error: 'Не получилось составить список для этого запроса' }, 502);
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

    return jsonResponse({ items, recipe });
  } catch (error) {
    console.error('shopping-ai-generate error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
