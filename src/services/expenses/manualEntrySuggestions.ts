import { supabase } from '../api/supabaseClient';

// Подсказки для ручного ввода расхода. Смысл: люди покупают одно и то же
// в одних и тех же магазинах, поэтому большую часть формы можно заполнить
// за один тап по истории вместо набора руками и листания сетки категорий.

export type FrequentItem = {
  name: string;
  categoryName: string;
  lastPrice: number;
  count: number;
};

// Берём заметный срез истории, а не всю: этого хватает, чтобы понять
// привычки, и не тянет мегабайты при длинной истории покупок.
const HISTORY_LIMIT = 400;
const FREQUENT_ITEMS_SHOWN = 8;
const RECENT_STORES_SHOWN = 6;

export async function fetchFrequentItems(userId: string): Promise<FrequentItem[]> {
  const { data } = await supabase
    .from('receipt_items')
    .select('cleaned_name, category_name, price, quantity, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (!data) return [];

  const byName = new Map<string, FrequentItem>();
  for (const row of data) {
    const key = row.cleaned_name.trim();
    if (!key) continue;

    const existing = byName.get(key.toLowerCase());
    if (existing) {
      existing.count += 1;
      continue;
    }
    // Данные отсортированы от новых к старым, поэтому первая встреченная
    // строка — самая свежая: её цена и категория и берутся как актуальные.
    const qty = row.quantity || 1;
    byName.set(key.toLowerCase(), {
      name: key,
      categoryName: row.category_name,
      lastPrice: qty > 1 ? row.price / qty : row.price,
      count: 1,
    });
  }

  return [...byName.values()].sort((a, b) => b.count - a.count).slice(0, FREQUENT_ITEMS_SHOWN);
}

export async function fetchRecentStores(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('receipts')
    .select('store_name, created_at')
    .eq('user_id', userId)
    .not('store_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (!data) return [];

  const seen = new Set<string>();
  const stores: string[] = [];
  for (const row of data) {
    const name = row.store_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    stores.push(name);
    if (stores.length >= RECENT_STORES_SHOWN) break;
  }
  return stores;
}

// Словарь для товаров, которых ещё нет в личной истории. Покрывает то, что
// люди реально вносят руками; для остального сработает история — один раз
// поправив категорию, пользователь больше её не выбирает.
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: 'Снеки',
    keywords: [
      'мороже', 'ice cream', 'zmrzlin', 'эским', 'чипс', 'chips', 'chipsy', 'brambůrk', 'brambur',
      'шоколад', 'chocolate', 'čokolád', 'cokolad', 'конфет', 'candy', 'sweets', 'bonbon',
      'печень', 'cookie', 'biscuit', 'sušenk', 'susenk', 'вафл', 'waffle', 'oplatk',
      'снек', 'snack', 'орех', 'nuts', 'ořech', 'orech', 'сухар', 'крекер', 'cracker',
      'батончик', 'bar', 'kinder', 'snickers', 'twix', 'mars', 'milka', 'lays', "lay's",
      'попкорн', 'popcorn', 'жвач', 'chewing', 'žvýkač', 'зефир', 'мармелад', 'пастил',
      'торт', 'cake', 'dort', 'пирожн', 'десерт', 'dessert', 'пончик', 'donut', 'круассан',
    ],
  },
  {
    category: 'Продукты',
    keywords: [
      'молок', 'milk', 'mléko', 'mleko', 'хлеб', 'bread', 'chléb', 'chleb', 'сыр', 'cheese', 'sýr',
      'яйц', 'egg', 'vejce', 'мясо', 'meat', 'maso', 'куриц', 'курин', 'chicken', 'kuře', 'kure',
      'рыб', 'fish', 'ryba', 'losos', 'лосос', 'тунец', 'tuna', 'рис', 'rice', 'rýže', 'ryze',
      'макарон', 'pasta', 'těstovin', 'testovin', 'спагетти', 'spaghetti', 'греч', 'мука', 'flour',
      'овощ', 'vegetable', 'zelenin', 'фрукт', 'fruit', 'ovoce', 'яблок', 'apple', 'jablk',
      'банан', 'banana', 'картоф', 'potato', 'brambor', 'морков', 'carrot', 'mrkev',
      'помидор', 'томат', 'tomato', 'rajč', 'огурц', 'cucumber', 'okurk', 'лук', 'onion', 'cibul',
      'масл', 'butter', 'máslo', 'maslo', 'oil', 'йогурт', 'yogurt', 'yoghurt', 'jogurt',
      'колбас', 'ветчин', 'salami', 'салями', 'šunka', 'sunka', 'сосиск', 'párk', 'бекон', 'bacon',
      'сметан', 'творог', 'tvaroh', 'сахар', 'sugar', 'cukr', 'соль', 'salt', 'sůl',
      'крупа', 'консерв', 'суп', 'soup', 'polévk', 'соус', 'sauce', 'omáčk', 'кетчуп', 'майонез',
      'филе', 'fillet', 'фарш', 'mleté', 'говядин', 'beef', 'hovězí', 'свинин', 'pork', 'vepřov',
    ],
  },
  {
    category: 'Напитки',
    keywords: [
      'вода', 'water', 'voda', 'сок', 'juice', 'džus', 'dzus', 'cola', 'кола', 'pepsi', 'fanta',
      'sprite', 'лимонад', 'limonád', 'limonad', 'напит', 'drink', 'nápoj', 'napoj',
      'пиво', 'beer', 'pivo', 'birell', 'вино', 'wine', 'víno', 'vino', 'сидр', 'cider',
      'энергет', 'energy', 'redbull', 'red bull', 'monster', 'чай', 'tea', 'čaj', 'caj',
      'квас', 'морс', 'смузи', 'smoothie', 'коктейл', 'водка', 'vodka', 'виски', 'whisky', 'ром', 'rum',
    ],
  },
  {
    category: 'Кофе',
    keywords: ['кофе', 'coffee', 'káva', 'kava', 'латте', 'latte', 'капучино', 'cappuccino', 'эспрессо', 'espresso', 'американо', 'americano', 'starbucks', 'costa', 'раф', 'flat white'],
  },
  {
    category: 'Кафе и рестораны',
    keywords: [
      'кафе', 'cafe', 'káva s', 'ресторан', 'restaurant', 'restaurac', 'обед', 'lunch', 'oběd', 'obed',
      'ужин', 'dinner', 'večeře', 'завтрак', 'breakfast', 'snídaně', 'бар', 'паб', 'pub',
      'пицц', 'pizza', 'бургер', 'burger', 'mcdonald', 'kfc', 'burger king', 'subway',
      'суши', 'sushi', 'шаурм', 'kebab', 'кебаб', 'нагетс', 'nugget', 'фастфуд', 'fast food',
      'столов', 'бизнес-ланч', 'menu dne',
    ],
  },
  {
    category: 'Доставка еды',
    keywords: ['доставка', 'delivery', 'wolt', 'bolt food', 'foodora', 'glovo', 'damejidlo', 'dámejídlo', 'rohlik', 'rohlík', 'kosik', 'košík', 'яндекс еда', 'деливери'],
  },
  {
    category: 'Транспорт',
    keywords: [
      'метро', 'metro', 'автобус', 'bus', 'трамва', 'tram', 'такси', 'taxi', 'uber', 'bolt',
      'бензин', 'fuel', 'benzin', 'дизел', 'diesel', 'заправк', 'топлив', 'shell', 'omv', 'orlen',
      'билет', 'ticket', 'jízdenk', 'jizdenk', 'lítačk', 'litack', 'проезд', 'поезд', 'train', 'vlak',
      'самокат', 'scooter', 'парков', 'parking', 'parkov', 'каршеринг', 'самолет', 'flight', 'letenk',
    ],
  },
  {
    category: 'Дом',
    keywords: [
      'аренда', 'rent', 'nájem', 'najem', 'квартир', 'коммунал', 'электрич', 'electricity', 'elektřin',
      'газ', 'gas', 'plyn', 'вода счет', 'интернет', 'internet', 'мебел', 'furniture', 'nábytek',
      'ikea', 'посуд', 'ремонт', 'лампоч', 'bulb', 'батарейк', 'battery', 'baterie',
      'полотенц', 'towel', 'постель', 'подушк', 'штор', 'ковер', 'инструмент', 'hornbach', 'obi',
    ],
  },
  {
    category: 'Гигиена',
    keywords: [
      'шампун', 'shampoo', 'мыло', 'soap', 'mýdlo', 'mydlo', 'зубн', 'toothpaste', 'zubní', 'zubni',
      'щетк', 'brush', 'kartáč', 'гель для душа', 'shower', 'sprchov', 'дезодорант', 'deodorant',
      'бумаг', 'toilet paper', 'papír', 'papir', 'салфетк', 'ubrousk', 'порошок', 'моющ', 'čistič',
      'крем', 'cream', 'krém', 'прокладк', 'тампон', 'бритв', 'razor', 'holic', 'ватн', 'пена для брит',
    ],
  },
  {
    category: 'Одежда',
    keywords: [
      'футбол', 'tshirt', 't-shirt', 'shirt', 'tričk', 'trick', 'штан', 'jeans', 'джинс', 'kalhot',
      'куртк', 'jacket', 'bunda', 'обув', 'shoes', 'boty', 'кросс', 'sneaker', 'tenisk',
      'носк', 'socks', 'ponožk', 'ponozk', 'одежд', 'clothes', 'oblečen', 'платье', 'dress', 'šaty',
      'свитер', 'sweater', 'svetr', 'шапк', 'cap', 'čepic', 'бель', 'underwear', 'ремень', 'сумк',
    ],
  },
  {
    category: 'Подписки',
    keywords: ['подписк', 'subscription', 'předplatn', 'predplatn', 'netflix', 'spotify', 'youtube', 'icloud', 'google one', 'chatgpt', 'hbo', 'disney', 'prime', 'тариф', 'связь', 'мобильн', 'operátor'],
  },
  {
    category: 'Развлечения',
    keywords: [
      'кино', 'cinema', 'kino', 'концерт', 'concert', 'koncert', 'театр', 'theatre', 'divadl',
      'игр', 'game', 'hra', 'steam', 'playstation', 'xbox', 'nintendo', 'бассейн', 'pool', 'bazén',
      'спортзал', 'gym', 'fitness', 'посиделк', 'музей', 'museum', 'muzeum', 'выставк', 'клуб',
      // Составные исключения: одиночное «билет» — это транспорт, поэтому
      // такие сочетания перечислены целиком, чтобы перебить его по длине.
      'билет в кино', 'билеты в кино', 'билет в театр', 'билеты в театр', 'билет на концерт',
      'боулинг', 'квест', 'аттракцион', 'zoo', 'зоопарк', 'книг', 'book', 'knih',
    ],
  },
  {
    category: 'Здоровье',
    keywords: [
      'аптек', 'pharmacy', 'lékárn', 'lekarn', 'врач', 'doctor', 'lékař', 'lekar', 'лекарст',
      'medicine', 'lék', 'таблет', 'pill', 'витамин', 'vitamin', 'стоматол', 'dentist', 'zubař',
      'анализ', 'массаж', 'massage', 'masáž', 'очк', 'glasses', 'brýle', 'линз', 'lens', 'čočk',
      'пластыр', 'бинт', 'страховк', 'pojištěn', 'больниц', 'nemocnic',
    ],
  },
  {
    category: 'Питомцы',
    keywords: ['корм', 'pet food', 'granul', 'кошк', 'cat', 'kočk', 'kock', 'собак', 'dog', 'pes', 'ветеринар', 'vet', 'veterin', 'наполнител', 'litter', 'stelivo', 'whiskas', 'pedigree', 'royal canin', 'игрушка для'],
  },
];

const LETTER = /[\p{L}\p{N}]/u;

/**
 * Позиция первого вхождения `keyword`, начинающегося с начала слова,
 * либо -1. Ключевые слова — это основы («молок», «мороже»), поэтому
 * совпадение должно начинаться со слова, а не находиться внутри него:
 * иначе «шоКОЛАдка» ловится как «кола», а «неГАЗированная» — как «газ».
 */
function firstWordStartIndex(query: string, keyword: string): number {
  let from = 0;
  for (;;) {
    const index = query.indexOf(keyword, from);
    if (index < 0) return -1;
    const before = index === 0 ? '' : query[index - 1];
    if (!before || !LETTER.test(before)) return index;
    from = index + 1;
  }
}

export type CategoryPrediction = {
  category: string;
  // Откуда взялась догадка — влияет на порядок и на подпись в интерфейсе.
  source: 'history' | 'keyword' | 'frequent';
};

/**
 * Ранжированные догадки о категории. Первая — самая вероятная.
 *
 * Приоритет: личная история (пользователь сам однажды выбрал эту категорию
 * для этого товара — точнее сигнала нет) → словарь ключевых слов → просто
 * самые используемые категории. Благодаря первому шагу система учится:
 * достаточно один раз поправить категорию, и дальше она подставляется сама.
 *
 * `available` ограничивает выдачу категориями, которые реально есть у
 * пользователя (он мог удалить стандартные или добавить свои).
 */
export function predictCategories(
  name: string,
  history: FrequentItem[],
  available: string[],
  limit = 3,
): CategoryPrediction[] {
  const exists = (category: string) => available.length === 0 || available.includes(category);
  const results: CategoryPrediction[] = [];
  const seen = new Set<string>();

  const push = (category: string, source: CategoryPrediction['source']) => {
    if (!category || seen.has(category) || !exists(category)) return;
    seen.add(category);
    results.push({ category, source });
  };

  const query = name.trim().toLowerCase();

  if (query.length >= 2) {
    const exact = history.find((item) => item.name.toLowerCase() === query);
    if (exact) push(exact.categoryName, 'history');

    for (const item of history) {
      const itemName = item.name.toLowerCase();
      if (itemName.includes(query) || query.includes(itemName)) push(item.categoryName, 'history');
    }

    // Решает первое совпавшее слово: в названиях покупок главное слово идёт
    // первым, а дальше уточнения («кофе с молоком» — кофе, «молоко 3.2%» —
    // продукты). При равной позиции побеждает более длинное совпадение —
    // так составные исключения вроде «билет в кино» перебивают общее «билет».
    const keywordHits: { category: string; index: number; length: number }[] = [];
    for (const rule of CATEGORY_KEYWORDS) {
      for (const keyword of rule.keywords) {
        const index = firstWordStartIndex(query, keyword);
        if (index >= 0) keywordHits.push({ category: rule.category, index, length: keyword.length });
      }
    }
    keywordHits.sort((a, b) => a.index - b.index || b.length - a.length);
    for (const hit of keywordHits) push(hit.category, 'keyword');
  }

  // Добиваем список самыми используемыми категориями — чтобы даже при
  // пустом поле было что показать вместо стены из пятнадцати плиток.
  const usage = new Map<string, number>();
  for (const item of history) {
    usage.set(item.categoryName, (usage.get(item.categoryName) ?? 0) + item.count);
  }
  const byUsage = [...usage.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
  for (const category of byUsage) push(category, 'frequent');

  return results.slice(0, limit);
}
