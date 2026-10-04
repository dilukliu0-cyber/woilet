// Supabase Edge Function: scan-receipt
//
// Принимает фото чека (base64), отправляет в Gemini Vision, возвращает
// структурированные данные (§14 master-документа). Ключ Gemini хранится
// только здесь как секрет окружения (GEMINI_API_KEY) — никогда не попадает
// в мобильное приложение (§8, §39.4).
//
// Deploy: supabase functions deploy scan-receipt
// Secret: supabase secrets set GEMINI_API_KEY=... (или через Dashboard →
//         Project Settings → Edge Functions → Secrets)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkScanQuota } from '../_shared/entitlement.ts';

// gemini-2.0-flash снят с поддержки Google (404 на generateContent), актуальная
// дешёвая модель — 2.5-flash. У неё по умолчанию включён "thinking"-режим,
// который добавляет сотни лишних токенов на каждый запрос — отключаем его
// ниже через generationConfig.thinkingConfig, иначе распознавание станет
// заметно дороже без прироста качества для такой задачи (§2.1).
const GEMINI_MODEL = 'gemini-2.5-flash';
const CATEGORY_NAMES = [
  'Продукты',
  'Снеки',
  'Напитки',
  'Кофе',
  'Кафе и рестораны',
  'Доставка еды',
  'Транспорт',
  'Дом',
  'Гигиена',
  'Одежда',
  'Подписки',
  'Развлечения',
  'Здоровье',
  'Питомцы',
  'Другое',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русский',
  cs: 'чешский',
  en: 'английский',
};

function buildSystemPrompt(translateToLanguage: string | null, knownNames: string[]): string {
  const translationRule = translateToLanguage
    ? `Переведи cleanedName на ${translateToLanguage} язык (кроме имён собственных и брендов — «Coca-Cola», ` +
      `«Lay's» и т.п. оставляй как есть, переводится только описание товара). Это применяется ПОСЛЕ ` +
      `приведения названия к читаемому виду (см. правило ниже).\n`
    : '';

  // Без этого модель на каждый скан придумывает название заново («Куриное
  // филе», «Филе куриное охл.»), и один товар в статистике распадается на
  // несколько. Свой прошлый словарь она переиспользует охотно.
  const vocabularyRule = knownNames.length
    ? `\nПользователь уже покупал эти товары:\n${knownNames.map((name) => `- ${name}`).join('\n')}\n` +
      `Для каждого товара из чека реши, есть ли он в этом списке. Совпадением считается тот же самый ` +
      `товар, даже если на кассе он записан на другом языке или в транслитерации («Pomelo» и «Помело» — ` +
      `одно и то же). Если совпадение есть — верни его строку в matchedKnownName ТОЧНО, символ в символ. ` +
      `Если отличается вкус, объём, вес или жирность — это ДРУГОЙ товар, matchedKnownName = null. ` +
      `Сомневаешься — null. Не выдумывай названия, которых нет в списке.\n`
    : '';

  return `Ты анализируешь фото кассового чека. Извлеки структурированные данные.${vocabularyRule}
cleanedName — нормальное человеческое название товара, а не сырой текст с кассы. Расшифровывай
сокращения, артикулы и коды упаковки (например «ХЛ БЕЛ НАР 500Г» → «Хлеб белый нарезной», «МОЛ 3.2% 1Л» →
«Молоко 3.2%»). Но если название на чеке и так понятно человеку (бренд + товар, например «Lay's Sour
Cream & Onion» или «Coca-Cola Zero») — не переписывай и не сокращай его, оставь как есть, поправив только
опечатки и регистр. Правило: чем более «зашифровано» название на чеке, тем сильнее его нужно раскрыть;
уже понятные названия трогать не нужно.
Отдельный случай — название, которое НЕ говорит, что это за товар: одна марка («Horalky», «Granko»,
«Kubík», «Bebe»), внутренний код магазина или набор букв. Тогда в cleanedName напиши и вид товара, и
марку: «Horalky» → «Вафли Horalky», «Granko» → «Какао-напиток Granko», «JGRT AKT BIL» → «Йогурт Aktivia
белый». Писать одну только категорию («Вафли») нельзя: разные марки склеятся в один товар.
Если по чеку правда не понять, что это за товар, — оставь название как есть и поставь needsReview = true.
Выдумывать вид товара запрещено: «BLD 4457» так и останется «BLD 4457».
brand — производитель или торговая марка («Horalky», «Coca-Cola», «Pilsner Urquell»). Заполняй его
всегда, когда марка видна на чеке, даже если она уже входит в cleanedName. Для товаров без марки
(весовые овощи, хлеб на развес, пакет) — null.
${translationRule}Не выдумывай цену или данные, которых не видно на чеке.
purchaseDate ищи по ВСЕМУ чеку, особенно внизу рядом со временем и номером кассы: у Tesco, Lidl, Billa дата
напечатана в самом конце, в формате ДД.ММ.ГГГГ или ДД.ММ.ГГ. Верни её как YYYY-MM-DD. null — только если даты
на фото правда нет.
Как читать чешские чеки (Tesco, Lidl, Billa, Albert, Penny):
- Строка «2 x 24,90» над или под товаром — это количество и цена за штуку: quantity = 2, unitPrice = 24.90,
  price = 49.80. Отдельной позицией её не добавляй.
- Весовой товар: «0,456 kg x 49,90 Kč/kg» — quantity = 1, weightValue = 0.456, weightUnit = "kg",
  unitPrice = 49.90, price = итог строки (22.75).
- Скидка печатается сразу под товаром строкой с минусом: «Clubcard cena -13,00», «Sleva -5,00», «Akce -4,00»,
  или с приставкой «CC»/«OC» и названием того же товара. Вычти её ОДИН раз из price товара над ней.
- Итоговые строки внизу («Celkem ušetřeno», «Ušetřili jste», «Úspora», «Clubcard úspora») — это сводка уже
  учтённых скидок, а не новые скидки. Повторно их НЕ вычитай и товаром НЕ записывай.
- Строки «Celkem», «K úhradě», «Platba kartou», «DPH», «Základ», «Zaokrouhlení» — не товары.
- totalAmount — сумма к оплате («Celkem» / «K úhradě»), уже со всеми скидками.
- Возврат тары («Záloha», «Vratná láhev») — отдельная позиция с положительной ценой, категория «Другое».
Скидки и акции («akce», «sleva», «Clubcard», строки с минусом) НЕ являются товарами: вычти скидку из price
того товара, к которому она относится, и не добавляй её отдельной позицией.
price — сумма за ВСЮ строку чека, то есть за все единицы товара сразу. unitPrice — цена за одну штуку.
Строка «Паштет 3 x 24,90  74,70» означает quantity = 3, unitPrice = 24.90, price = 74.70. На чеке цена
за штуку обычно напечатана заметнее итога по строке — не перепутай, в price идёт именно итог. Если штука
одна, price и unitPrice совпадают. Сумма всех price должна сходиться с totalAmount: это твоя проверка,
что ты нигде не подставил цену за штуку вместо цены за строку.
Если итоговая сумма товаров не совпадает с totalAmount — добавь предупреждение в warnings, не пытайся подогнать цифры.
Категория каждого товара должна быть ОДНОЙ из этого списка (ровно как написано): ${CATEGORY_NAMES.join(', ')}.
confidence меньше 0.7 — needsReview = true.
Верни ТОЛЬКО валидный JSON по такой схеме, без пояснений:
{
  "storeName": string,
  "storeAddress": string | null,
  "purchaseDate": string | null (YYYY-MM-DD),
  "purchaseTime": string | null (HH:MM),
  "currency": string (ISO 4217, например CZK),
  "totalAmount": number,
  "paymentMethod": string | null,
  "items": [
    {
      "rawName": string,
      "cleanedName": string,
      "matchedKnownName": string | null,
      "brand": string | null,
      "category": string,
      "price": number,
      "quantity": number,
      "unit": string,
      "weightValue": number | null,
      "weightUnit": string | null,
      "unitPrice": number | null,
      "confidence": number,
      "needsReview": boolean
    }
  ],
  "warnings": string[]
}`;
}

// §14.2: до 3 попыток с backoff при 429/5xx/сетевых ошибках Gemini.
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

    if (!geminiApiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY не настроен на сервере' }, 500);
    }

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

    // Квота бесплатного тарифа проверяется ДО обращения к Gemini — иначе
    // превышение всё равно стоило бы денег. Клиент об этом лимите тоже знает
    // и рисует счётчик, но решение принимается только здесь.
    const quota = await checkScanQuota(serviceClient, user.id);
    if (!quota.allowed) {
      return jsonResponse(
        {
          error: 'Закончились бесплатные сканы в этом месяце',
          code: 'quota_exceeded',
          used: quota.used,
          limit: quota.limit,
        },
        402,
      );
    }

    const { imageBase64, mimeType, language, translateItems } = await req.json();
    if (!imageBase64 || !mimeType) {
      return jsonResponse({ error: 'imageBase64 и mimeType обязательны' }, 400);
    }

    const translateToLanguage = translateItems && typeof language === 'string' ? LANGUAGE_NAMES[language] ?? null : null;
    const knownNames = await fetchKnownProductNames(serviceClient, user.id);
    const systemPrompt = buildSystemPrompt(translateToLanguage, knownNames);

    const geminiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini error', geminiResponse.status, errorText);
      return jsonResponse({ error: 'Не удалось обработать чек, попробуйте ещё раз' }, 502);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return jsonResponse({ error: 'ИИ вернул пустой ответ' }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return jsonResponse({ error: 'ИИ вернул некорректный JSON' }, 502);
    }

    // Скидки («akce», «sleva», Clubcard у Tesco) модель иногда отдаёт
    // отдельной позицией с отрицательной ценой. В статистике это выглядело
    // как товар за −13 Kč. Вычитаем скидку из цены товара, к которому она
    // относится (то же название, иначе предыдущая позиция), а строку убираем.
    if (Array.isArray(parsed?.items)) {
      parsed.items = foldDiscounts(parsed.items);

      // Самопроверка в коде, а не только просьба к модели: если сумма позиций
      // не сходится с итогом, пользователь должен это увидеть. На живых данных
      // так не сходилось 11 чеков из 50 — и молча портило статистику.
      const itemsSum = parsed.items.reduce((sum: number, item: ParsedItem) => sum + (Number(item.price) || 0), 0);
      const total = Number(parsed.totalAmount) || 0;
      if (total > 0 && Math.abs(itemsSum - total) > 1) {
        parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
        parsed.warnings.push(
          `Сумма позиций ${itemsSum.toFixed(2)} не сходится с итогом ${total.toFixed(2)} — проверьте чек или нажмите «Перезаписать».`,
        );
      }
    }

    // Модель могла придумать «известное» название, которого в словаре нет —
    // тогда вместо слияния дублей получился бы новый дубль. Поэтому
    // подставляем только то, что реально было в списке.
    const knownSet = new Set(knownNames);
    if (Array.isArray(parsed?.items)) {
      for (const item of parsed.items) {
        const matched = typeof item?.matchedKnownName === 'string' ? item.matchedKnownName.trim() : '';
        if (matched && knownSet.has(matched)) item.cleanedName = matched;
        delete item.matchedKnownName;
      }
    }

    const usage = geminiData.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    // Ориентировочная цена Gemini 2.5 Flash (без thinking) — проверьте
    // актуальный тариф на ai.google.dev/pricing, здесь грубая оценка для мониторинга.
    const estimatedCost = (inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000;

    // kind='scan' — по этим записям считается месячная квота бесплатного
    // тарифа (см. _shared/entitlement.ts).
    await serviceClient.from('ai_api_usage').insert({
      user_id: user.id,
      model: GEMINI_MODEL,
      kind: 'scan',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
    });

    return jsonResponse({ result: parsed });
  } catch (error) {
    console.error('scan-receipt error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

// Словарь уже купленных товаров для подсказки модели. Берём недавние
// покупки: привычный ассортимент меняется медленно, а раздувать промпт всей
// историей и дорого, и вредно для точности.
async function fetchKnownProductNames(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await serviceClient
    .from('receipt_items')
    .select('cleaned_name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !data) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of data) {
    const name = (row.cleaned_name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 120) break;
  }
  return names;
}

type ParsedItem = { cleanedName?: string; price?: number; [key: string]: unknown };

function foldDiscounts(items: ParsedItem[]): ParsedItem[] {
  const result: ParsedItem[] = [];
  for (const item of items) {
    const price = Number(item?.price);
    if (!(price < 0)) {
      result.push(item);
      continue;
    }
    const name = (item.cleanedName ?? '').trim().toLowerCase();
    const target =
      [...result].reverse().find((r) => (r.cleanedName ?? '').trim().toLowerCase() === name && Number(r.price) > 0) ??
      [...result].reverse().find((r) => Number(r.price) > 0);
    if (target) {
      target.price = Math.round((Number(target.price) + price) * 100) / 100;
      if (typeof target.unitPrice === 'number' && typeof target.quantity === 'number' && target.quantity > 0) {
        target.unitPrice = Math.round((Number(target.price) / target.quantity) * 100) / 100;
      }
    }
    // Скидку без товара, к которому её приписать, просто отбрасываем:
    // отрицательная позиция в статистике хуже, чем недоучтённая скидка.
  }
  return result;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
