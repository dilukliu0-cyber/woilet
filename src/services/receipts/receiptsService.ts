import { decode } from 'base64-arraybuffer';
import { supabase } from '../api/supabaseClient';
import type { RecognizedItem, RecognizedReceipt } from '../../types/receipt';
import { translate } from '../../i18n/translate';

type SaveReceiptOptions = {
  baseCurrency: string;
  // §28.1: пользователь осознанно сохраняет дубликат после предупреждения.
  force?: boolean;
};

type SaveReceiptResult =
  | { receiptId: string; error: null; duplicate: null; checkedShoppingItems: number }
  | { receiptId: null; error: string; duplicate: null; checkedShoppingItems: 0 }
  | { receiptId: null; error: null; duplicate: { date: string | null; total: number }; checkedShoppingItems: 0 };

const rateCache = new Map<string, number>();

async function getExchangeRate(from: string, to: string): Promise<number | null> {
  if (!from || !to || from === to) return 1;

  const cacheKey = `${from}->${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const rate = data?.rates?.[to];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
    rateCache.set(cacheKey, rate);
    return rate;
  } catch {
    return null;
  }
}
// §28.1: хэш от магазина + даты + суммы + числа позиций + первых 3 названий.
function computeReceiptHash(recognized: RecognizedReceipt): string {
  const parts = [
    (recognized.storeName ?? '').toLowerCase().trim(),
    recognized.purchaseDate ?? '',
    recognized.purchaseTime ?? '',
    recognized.totalAmount.toFixed(2),
    String(recognized.items.length),
    ...recognized.items.slice(0, 3).map((i) => i.cleanedName.toLowerCase().trim()),
  ].join('|');

  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) + hash + parts.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

export async function saveReceipt(
  userId: string,
  imageBase64: string,
  recognized: RecognizedReceipt,
  options: SaveReceiptOptions,
): Promise<SaveReceiptResult> {
  const receiptHash = computeReceiptHash(recognized);

  if (!options.force) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('receipts')
      .select('purchase_date, total_amount')
      .eq('user_id', userId)
      .eq('receipt_hash', receiptHash)
      .gte('created_at', dayAgo)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return {
        receiptId: null,
        error: null,
        duplicate: { date: existing.purchase_date, total: existing.total_amount ?? 0 },
        checkedShoppingItems: 0,
      };
    }
  }

  const imagePath = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(imagePath, decode(imageBase64), { contentType: 'image/jpeg' });

  if (uploadError) {
    return {
      receiptId: null,
      error: `${translate('svc_photo_upload_failed')}: ${uploadError.message}`,
      duplicate: null,
      checkedShoppingItems: 0,
    };
  }

  const status = recognized.items.some((item) => item.needsReview) ? 'needs_review' : 'recognized';

  // §14.1: конвертация в базовую валюту для аналитики; исходные данные чека не трогаем.
  const rate = await getExchangeRate(recognized.currency, options.baseCurrency);
  const warnings = [...recognized.warnings];
  if (rate === null && recognized.currency !== options.baseCurrency) {
    warnings.push(translate('svc_warn_no_rate'));
  }

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_path: imagePath,
      store_name: recognized.storeName,
      store_address: recognized.storeAddress,
      purchase_date: recognized.purchaseDate,
      purchase_time: recognized.purchaseTime,
      currency: recognized.currency,
      total_amount: recognized.totalAmount,
      payment_method: recognized.paymentMethod,
      status,
      warnings,
      exchange_rate: rate ?? 1,
      base_currency: options.baseCurrency,
      receipt_hash: receiptHash,
    })
    .select('id')
    .single();

  if (receiptError || !receipt) {
    return {
      receiptId: null,
      error: `${translate('svc_receipt_save_failed')}: ${receiptError?.message}`,
      duplicate: null,
      checkedShoppingItems: 0,
    };
  }

  const itemsPayload = recognized.items.map((item: RecognizedItem) => ({
    receipt_id: receipt.id,
    user_id: userId,
    raw_name: item.rawName,
    cleaned_name: item.cleanedName,
    brand: item.brand,
    category_name: item.category,
    price: item.price,
    quantity: item.quantity,
    unit: item.unit,
    weight_value: item.weightValue,
    weight_unit: item.weightUnit,
    unit_price: item.unitPrice,
    confidence: item.confidence,
    needs_review: item.needsReview,
  }));

  const { error: itemsError } = await supabase.from('receipt_items').insert(itemsPayload);

  if (itemsError) {
    return {
      receiptId: null,
      error: `${translate('svc_items_save_failed')}: ${itemsError.message}`,
      duplicate: null,
      checkedShoppingItems: 0,
    };
  }

  const checkedShoppingItems = await autoCheckShoppingList(userId, recognized.items);

  return { receiptId: receipt.id, error: null, duplicate: null, checkedShoppingItems };
}

export async function updateReceiptItem(
  itemId: string,
  patch: { cleaned_name: string; price: number; category_name: string },
): Promise<string | null> {
  const { error } = await supabase.from('receipt_items').update(patch).eq('id', itemId);
  return error?.message ?? null;
}

export async function deleteReceiptItem(itemId: string): Promise<string | null> {
  const { error } = await supabase.from('receipt_items').delete().eq('id', itemId);
  return error?.message ?? null;
}

export async function deleteReceipt(receiptId: string, imagePath: string | null): Promise<string | null> {
  const { error } = await supabase.from('receipts').delete().eq('id', receiptId);
  if (error) return error.message;
  if (imagePath) await supabase.storage.from('receipts').remove([imagePath]);
  return null;
}

type AddManualExpenseInput = {
  name: string;
  price: number;
  categoryName: string;
  storeName: string | null;
  quantity: number;
  currency: string;
  // YYYY-MM-DD. Не задана — считаем, что покупка сегодняшняя.
  purchaseDate?: string;
};

export async function addManualExpense(
  userId: string,
  input: AddManualExpenseInput,
): Promise<{ error: string | null }> {
  const purchaseDate = input.purchaseDate ?? new Date().toISOString().slice(0, 10);
  const total = input.price * input.quantity;

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_path: null,
      source: 'manual',
      store_name: input.storeName,
      purchase_date: purchaseDate,
      currency: input.currency,
      total_amount: total,
      status: 'recognized',
      warnings: [],
      exchange_rate: 1,
      base_currency: input.currency,
    })
    .select('id')
    .single();

  if (receiptError || !receipt) {
    return { error: receiptError?.message ?? translate('svc_expense_save_failed') };
  }

  const { error: itemError } = await supabase.from('receipt_items').insert({
    receipt_id: receipt.id,
    user_id: userId,
    cleaned_name: input.name,
    category_name: input.categoryName,
    price: total,
    quantity: input.quantity,
    unit: 'pcs',
    needs_review: false,
  });

  if (itemError) {
    return { error: itemError.message };
  }

  return { error: null };
}

// Разбить название на значимые слова: нижний регистр, без диакритики, без
// цифр/веса/единиц, только слова длиной от 3 букв.
function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zа-яё\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

// «чипсы» → «chipsy»: ловит бытовые англицизмы, которые пользователь пишет
// по-русски, а на чеке они остаются оригиналом (чипсы/chips, кола/cola).
function transliterate(word: string): string {
  return [...word].map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join('');
}

function rootMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.startsWith(shorter)) return true;
  let common = 0;
  while (common < shorter.length && shorter[common] === longer[common]) common++;
  // Общий корень: минимум 4 буквы и не меньше длины короткого слова минус окончание.
  return common >= 4 && common >= shorter.length - 2;
}

// Совпадают ли два слова по корню: одно начинается с другого, общий префикс
// достаточной длины (огурец/огурцы, молоко/молока, okurka/okurky), либо то же
// самое после транслитерации (чипсы/chips).
function wordsMatch(a: string, b: string): boolean {
  return rootMatch(a, b) || rootMatch(transliterate(a), transliterate(b));
}

// §29: купленный товар отмечается в списке покупок автоматически после чека.
// Возвращает число отмеченных пунктов — экран показывает тост.
export async function autoCheckShoppingList(
  userId: string,
  purchasedItems: RecognizedItem[],
): Promise<number> {
  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!list) return 0;

  const { data: pendingItems } = await supabase
    .from('shopping_list_items')
    .select('id, text')
    .eq('list_id', list.id)
    .eq('checked', false);

  if (!pendingItems || pendingItems.length === 0) return 0;

  const purchasedWordSets = purchasedItems.map((item) => significantWords(item.cleanedName));

  const matchedIds = pendingItems
    .filter((pending) => {
      const needleWords = significantWords(pending.text);
      if (needleWords.length === 0) return false;
      // Хотя бы одно слово из пункта списка совпадает по корню со словом в чеке.
      return needleWords.some((needle) =>
        purchasedWordSets.some((words) => words.some((word) => wordsMatch(needle, word))),
      );
    })
    .map((pending) => pending.id);

  if (matchedIds.length > 0) {
    await supabase.from('shopping_list_items').update({ checked: true }).in('id', matchedIds);
  }
  return matchedIds.length;
}
