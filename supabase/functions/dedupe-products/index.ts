// Supabase Edge Function: dedupe-products
//
// Сливает разные написания одного товара. Строковая нормализация тут не
// помогает: «Birell 0.0 Pomelo» и «Birell 0.0 Помело» не совпадают ни одним
// символом, а «Coca-Cola Zero без кофеина» и «Напиток Coca-Cola Zero» — тем
// более. Понять, что это один товар, может только модель.
//
// Опасность обратная: рядом лежат «Lay's Max Cheese & Onion» и «Lay's Max
// Cheese Chips», которые могут быть разными вкусами. Поэтому правила в
// промпте запрещают объединять по вкусу, объёму и жирности, а ответ модели
// проверяется — придуманные ею названия отбрасываются.
//
// Deploy: supabase functions deploy dedupe-products

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';

// Реже, чем раз в сутки, ассортимент заметно не меняется, а каждый вызов
// стоит денег.
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Group = { canonical: string; aliases: string[] };

function buildPrompt(names: string[]): string {
  return `Ниже список названий товаров из чеков одного человека. Одна и та же покупка могла записаться
по-разному: на другом языке, в транслитерации, с лишним словом «Напиток», короче или длиннее.

Сгруппируй названия, которые обозначают ОДИН И ТОТ ЖЕ товар.

Объединяй, если различие только в языке или формулировке:
- «Birell 0.0 Pomelo» и «Birell 0.0 Помело» — один товар
- «Coca-Cola Zero Caffeine Free», «Coca-Cola Zero без кофеина», «Напиток Coca-Cola Zero» — один товар
- «Морозиво» и «Мороженое» — один товар

НЕ объединяй, если отличается хоть что-то из этого:
- вкус или разновидность («Cheese & Onion» и «Sour Cream & Onion» — РАЗНЫЕ)
- объём, вес, размер упаковки
- жирность или процент
- обычный и облегчённый, с сахаром и без
Если сомневаешься — НЕ объединяй. Ошибочное слияние портит статистику сильнее, чем оставшийся дубль.

canonical — название, которое останется. Выбирай самое понятное и полное, на языке большинства
названий в группе. canonical и все aliases обязаны быть ТОЧНЫМИ строками из списка ниже,
символ в символ. Не придумывай новых названий.

Группы из одного названия не включай.

Список:
${names.map((name) => `- ${name}`).join('\n')}

Верни ТОЛЬКО валидный JSON без пояснений:
{"groups":[{"canonical":"...","aliases":["...","..."]}]}`;
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
    const force = await req.json().then((body) => body?.force === true).catch(() => false);

    const { data: settings } = await serviceClient
      .from('user_settings')
      .select('last_dedupe_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const lastRun = settings?.last_dedupe_at ? new Date(settings.last_dedupe_at).getTime() : 0;
    if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) {
      return jsonResponse({ skipped: true, reason: 'too_soon' });
    }

    // Названия с числом покупок: канонический вариант при прочих равных
    // выбирается моделью, но частота помогает ей понять, что привычнее.
    const { data: items } = await serviceClient
      .from('receipt_items')
      .select('cleaned_name')
      .eq('user_id', user.id)
      .limit(2000);

    const names = [...new Set((items ?? []).map((row) => (row.cleaned_name ?? '').trim()).filter(Boolean))];

    // На двух-трёх названиях сливать нечего, а вызов всё равно платный.
    if (names.length < 4) {
      await touchLastRun(serviceClient, user.id);
      return jsonResponse({ skipped: true, reason: 'not_enough_data', merged: 0 });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(names) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      console.error('dedupe-products: gemini', geminiResponse.status, await geminiResponse.text());
      return jsonResponse({ error: 'Не удалось разобрать список товаров' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return jsonResponse({ error: 'ИИ вернул пустой ответ' }, 502);

    let parsed: { groups?: Group[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return jsonResponse({ error: 'ИИ вернул некорректный JSON' }, 502);
    }

    const known = new Set(names);
    const alreadyTouched = new Set<string>();
    const applied: { canonical: string; aliases: string[]; updated: number }[] = [];

    for (const group of parsed.groups ?? []) {
      const canonical = (group?.canonical ?? '').trim();
      // Модель обязана возвращать строки из списка. Всё остальное —
      // выдумка, и применять её к данным пользователя нельзя.
      if (!known.has(canonical) || alreadyTouched.has(canonical)) continue;

      const aliases = (group?.aliases ?? [])
        .map((alias) => (alias ?? '').trim())
        .filter((alias) => alias && alias !== canonical && known.has(alias) && !alreadyTouched.has(alias));

      if (aliases.length === 0) continue;

      alreadyTouched.add(canonical);
      aliases.forEach((alias) => alreadyTouched.add(alias));

      // Категорию тоже выравниваем по каноническому названию: иначе один
      // товар остаётся разложенным по двум категориям.
      const { data: canonicalRow } = await serviceClient
        .from('receipt_items')
        .select('category_name')
        .eq('user_id', user.id)
        .eq('cleaned_name', canonical)
        .limit(1)
        .maybeSingle();

      const patch: Record<string, string> = { cleaned_name: canonical };
      if (canonicalRow?.category_name) patch.category_name = canonicalRow.category_name;

      const { data: updated, error: updateError } = await serviceClient
        .from('receipt_items')
        .update(patch)
        .eq('user_id', user.id)
        .in('cleaned_name', aliases)
        .select('id');

      if (updateError) {
        console.error('dedupe-products: update', updateError);
        continue;
      }

      const count = updated?.length ?? 0;
      if (count > 0) {
        await serviceClient.from('product_merges').insert(
          aliases.map((alias) => ({
            user_id: user.id,
            merged_from: alias,
            merged_into: canonical,
            items_updated: count,
          })),
        );
        applied.push({ canonical, aliases, updated: count });
      }
    }

    await touchLastRun(serviceClient, user.id);

    const usage = geminiData.usageMetadata ?? {};
    await serviceClient.from('ai_api_usage').insert({
      user_id: user.id,
      model: GEMINI_MODEL,
      kind: 'dedupe',
      input_tokens: usage.promptTokenCount ?? 0,
      output_tokens: usage.candidatesTokenCount ?? 0,
      estimated_cost: ((usage.promptTokenCount ?? 0) * 0.3 + (usage.candidatesTokenCount ?? 0) * 2.5) / 1_000_000,
    });

    return jsonResponse({
      merged: applied.reduce((sum, group) => sum + group.aliases.length, 0),
      groups: applied,
    });
  } catch (error) {
    console.error('dedupe-products error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

async function touchLastRun(serviceClient: ReturnType<typeof createClient>, userId: string) {
  await serviceClient
    .from('user_settings')
    .update({ last_dedupe_at: new Date().toISOString() })
    .eq('user_id', userId);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
