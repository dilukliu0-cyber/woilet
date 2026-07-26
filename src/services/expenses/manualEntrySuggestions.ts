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

// Запасной вариант, когда товар вводится впервые и в истории его нет.
// Намеренно короткий список самых частых покупок — точность важнее охвата,
// неверно угаданную категорию пользователь всё равно может переставить.
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: 'Продукты',
    keywords: [
      'молок', 'milk', 'mléko', 'хлеб', 'bread', 'chléb', 'chleb', 'сыр', 'cheese', 'sýr',
      'яйц', 'egg', 'vejce', 'мясо', 'meat', 'maso', 'куриц', 'курин', 'chicken', 'kuře',
      'рыб', 'fish', 'ryba', 'рис', 'rice', 'rýže', 'макарон', 'pasta', 'těstoviny',
      'овощ', 'фрукт', 'яблок', 'apple', 'jablk', 'банан', 'banana', 'картоф', 'potato', 'brambor',
      'масл', 'butter', 'máslo', 'йогурт', 'yogurt', 'jogurt', 'колбас', 'ветчин', 'salami', 'šunka',
    ],
  },
  {
    category: 'Напитки',
    keywords: ['вода', 'water', 'voda', 'сок', 'juice', 'džus', 'cola', 'кола', 'лимонад', 'limonád', 'напит', 'пиво', 'beer', 'pivo', 'вино', 'wine', 'víno'],
  },
  { category: 'Кофе', keywords: ['кофе', 'coffee', 'káva', 'kava', 'латте', 'latte', 'капучино', 'cappuccino', 'эспрессо', 'espresso'] },
  { category: 'Снеки', keywords: ['чипс', 'chips', 'chipsy', 'шоколад', 'chocolate', 'čokolád', 'конфет', 'candy', 'печень', 'cookie', 'sušenk', 'снек', 'snack', 'орех', 'nuts'] },
  { category: 'Кафе и рестораны', keywords: ['кафе', 'cafe', 'ресторан', 'restaurant', 'restaurace', 'обед', 'lunch', 'ужин', 'dinner', 'бар', 'bar', 'пицц', 'pizza', 'бургер', 'burger'] },
  { category: 'Доставка еды', keywords: ['доставка', 'delivery', 'wolt', 'bolt food', 'foodora', 'glovo', 'damejidlo', 'dámejídlo'] },
  { category: 'Транспорт', keywords: ['метро', 'metro', 'автобус', 'bus', 'трамва', 'tram', 'такси', 'taxi', 'uber', 'bolt', 'бензин', 'fuel', 'benzin', 'заправк', 'билет', 'ticket', 'jízdenka', 'lítačka', 'litacka', 'поезд', 'train', 'vlak'] },
  { category: 'Дом', keywords: ['аренда', 'rent', 'nájem', 'najem', 'квартир', 'коммунал', 'электрич', 'electricity', 'газ', 'мебел', 'furniture', 'ikea', 'посуд', 'ремонт'] },
  { category: 'Гигиена', keywords: ['шампун', 'shampoo', 'мыло', 'soap', 'mýdlo', 'зубн', 'toothpaste', 'zubní', 'гель', 'дезодорант', 'deodorant', 'бумаг', 'paper', 'papír', 'порошок', 'моющ'] },
  { category: 'Одежда', keywords: ['футбол', 'shirt', 'tričko', 'штан', 'jeans', 'kalhoty', 'куртк', 'jacket', 'bunda', 'обув', 'shoes', 'boty', 'носк', 'socks', 'одежд', 'платье'] },
  { category: 'Подписки', keywords: ['подписк', 'subscription', 'předplatné', 'netflix', 'spotify', 'youtube', 'icloud', 'google one', 'apple', 'chatgpt'] },
  { category: 'Развлечения', keywords: ['кино', 'cinema', 'kino', 'концерт', 'concert', 'игр', 'game', 'hra', 'steam', 'playstation', 'xbox', 'бассейн', 'спортзал', 'gym', 'fitness'] },
  { category: 'Здоровье', keywords: ['аптек', 'pharmacy', 'lékárna', 'lekarna', 'врач', 'doctor', 'lékař', 'лекарст', 'medicine', 'lék', 'витамин', 'vitamin', 'стоматол', 'dentist'] },
  { category: 'Питомцы', keywords: ['корм', 'pet food', 'granule', 'кошк', 'cat', 'kočka', 'собак', 'dog', 'pes', 'ветеринар', 'vet', 'наполнител'] },
];

/**
 * Пытается определить категорию по названию товара. Сначала — по личной
 * истории пользователя (самый точный сигнал: он сам её однажды выбрал),
 * потом — по ключевым словам. null означает «не угадали», категорию
 * выбирает пользователь.
 */
export function guessCategory(name: string, history: FrequentItem[]): string | null {
  const query = name.trim().toLowerCase();
  if (query.length < 2) return null;

  const exact = history.find((item) => item.name.toLowerCase() === query);
  if (exact) return exact.categoryName;

  const partial = history.find(
    (item) => item.name.toLowerCase().includes(query) || query.includes(item.name.toLowerCase()),
  );
  if (partial) return partial.categoryName;

  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((keyword) => query.includes(keyword))) return rule.category;
  }

  return null;
}
