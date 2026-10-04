import { decode } from 'base64-arraybuffer';
import { supabase } from '../api/supabaseClient';
import { scanReceipt } from '../ai/scanReceipt';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import type { RecognizedReceipt } from '../../types/receipt';
import type { ReceiptRecord } from '../../types/receiptRecord';
import { autoCheckShoppingList } from './receiptsService';
import { runProductDedupe } from './productDedupe';
import { translate } from '../../i18n/translate';
import { beginScanActivity, failScanActivity, finishScanActivity } from './scanActivity';

// §13 (пожелание): фото не блокирует пользователя. Чек создаётся сразу со
// статусом processing, Gemini работает в фоне, строка в «Расходах» обновится
// сама при следующем фокусе экрана.

type SubmitResult = { receiptId: string | null; error: string | null };

export async function submitScan(
  userId: string,
  imageBase64: string,
  baseCurrency: string,
): Promise<SubmitResult> {
  // Островок запускаем до загрузки фото: она сама занимает несколько секунд,
  // и всё это время пользователь иначе не видит никакого отклика.
  const activityId = beginScanActivity();
  const imagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(imagePath, decode(imageBase64), { contentType: 'image/jpeg' });

  if (uploadError) {
    failScanActivity(activityId);
    return { receiptId: null, error: uploadError.message };
  }

  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_path: imagePath,
      currency: baseCurrency,
      status: 'processing',
      warnings: [],
      base_currency: baseCurrency,
      exchange_rate: 1,
    })
    .select('id')
    .single();

  if (insertError || !receipt) {
    failScanActivity(activityId);
    return { receiptId: null, error: insertError?.message ?? translate('svc_receipt_create_failed') };
  }

  // Фон: не await'ится вызывающим — ошибки переводят чек в статус error.
  processInBackground(receipt.id, userId, imageBase64, baseCurrency, activityId).catch(async () => {
    failScanActivity(activityId);
    await supabase
      .from('receipts')
      .update({ status: 'error', warnings: [translate('svc_warn_not_recognized')] })
      .eq('id', receipt.id);
  });

  return { receiptId: receipt.id, error: null };
}

// «Перезаписать»: распознать заново уже загруженное фото, без пересъёмки.
// Нужно, когда с первого раза магазин/товары не распозналось (status error
// или пустой чек). Фото берём из хранилища по image_path, старые позиции
// удаляем и прогоняем ту же фоновую обработку, что и при обычном скане.
export async function rescanReceipt(receipt: ReceiptRecord): Promise<{ error: string | null }> {
  if (!receipt.image_path) {
    return { error: translate('svc_warn_no_photo') };
  }

  const activityId = beginScanActivity();

  // Сразу переводим в «Обрабатывается», чтобы список/экран показали прогресс.
  await supabase
    .from('receipts')
    .update({ status: 'processing', warnings: [] })
    .eq('id', receipt.id);

  const { data: blob, error: downloadError } = await supabase.storage
    .from('receipts')
    .download(receipt.image_path);

  if (downloadError || !blob) {
    await supabase
      .from('receipts')
      .update({ status: 'error', warnings: [translate('svc_warn_photo_download_failed')] })
      .eq('id', receipt.id);
    failScanActivity(activityId);
    return { error: downloadError?.message ?? translate('svc_warn_photo_download_failed') };
  }

  let imageBase64: string;
  try {
    imageBase64 = await blobToBase64(blob);
  } catch {
    await supabase
      .from('receipts')
      .update({ status: 'error', warnings: [translate('svc_warn_photo_read_failed')] })
      .eq('id', receipt.id);
    failScanActivity(activityId);
    return { error: translate('svc_warn_photo_read_failed') };
  }

  const baseCurrency = receipt.base_currency ?? receipt.currency ?? 'CZK';

  // Старые позиции убираем — фоновая обработка вставит распознанные заново.
  await supabase.from('receipt_items').delete().eq('receipt_id', receipt.id);

  // Фон: не await'ится — ошибки переводят чек в статус error.
  processInBackground(receipt.id, receipt.user_id, imageBase64, baseCurrency, activityId).catch(async () => {
    failScanActivity(activityId);
    await supabase
      .from('receipts')
      .update({ status: 'error', warnings: [translate('svc_warn_rescan_failed')] })
      .eq('id', receipt.id);
  });

  return { error: null };
}

// Blob из хранилища → base64 (без префикса data:). FileReader — самый
// совместимый способ в Expo/RN, blob.arrayBuffer() тут не гарантирован.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}

async function processInBackground(
  receiptId: string,
  userId: string,
  imageBase64: string,
  baseCurrency: string,
  activityId: string | null,
): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const { data: recognized, error } = await scanReceipt(imageBase64, 'image/jpeg', {
    language: settings?.language,
    translateItems: settings?.translate_items,
  });
  if (error || !recognized) {
    throw new Error(error ?? 'empty result');
  }

  recognized.currency = normalizeCurrency(recognized.currency, baseCurrency);
  let status = recognized.items.some((item) => item.needsReview) ? 'needs_review' : 'recognized';
  const warnings = [...recognized.warnings];

  // Защита от повторного скана одного чека. Она была написана целиком, но
  // жила в saveReceipt, который перестали вызывать при переходе на фоновое
  // распознавание, — и с тех пор второй скан того же чека молча удваивал
  // траты.
  //
  // Вернуть как было нельзя: раньше проверка шла ДО вставки и просто
  // отказывалась сохранять, а теперь строка чека создаётся сразу, ещё до
  // того как известно, что на фото. Поэтому проверяем после распознавания и
  // НЕ удаляем: ложное срабатывание молча уничтожило бы чек. Помечаем — и
  // решает пользователь.
  const receiptHash = computeHash(recognized);
  // Пустой результат (не чек на фото, ничего не распознано) не сверяем:
  // у всех таких отпечаток одинаковый — пустой магазин и сумма 0, — и
  // каждый следующий помечался бы дублем предыдущего.
  const isEmpty = recognized.items.length === 0 && !recognized.totalAmount;
  const duplicate = isEmpty ? null : await findDuplicate(userId, receiptHash, receiptId, recognized);
  if (duplicate) {
    warnings.push(
      translate('svc_warn_duplicate', {
        date: duplicate.purchase_date ?? '—',
        total: `${(duplicate.total_amount ?? 0).toFixed(2)} ${duplicate.currency ?? ''}`.trim(),
      }),
    );
    status = 'needs_review';
  }

  let rate: number | null = 1;
  if (recognized.currency !== baseCurrency) {
    rate = await fetchRate(recognized.currency, baseCurrency);
    if (rate === null) {
      warnings.push(translate('svc_warn_no_rate'));
    }
  }

  const { error: updateError } = await supabase
    .from('receipts')
    .update({
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
      receipt_hash: receiptHash,
    })
    .eq('id', receiptId);

  if (updateError) throw new Error(updateError.message);

  const itemsPayload = recognized.items.map((item) => ({
    receipt_id: receiptId,
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

  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from('receipt_items').insert(itemsPayload);
    if (itemsError) throw new Error(itemsError.message);
  }

  // Итог в островке — только после того, как позиции реально легли в базу:
  // иначе он отрапортовал бы об успехе, которого нет.
  finishScanActivity(activityId, {
    storeName: recognized.storeName,
    totalAmount: recognized.totalAmount,
    currency: recognized.currency,
    itemCount: recognized.items.length,
  });

  // Разбор дублей запускается сам после скана: сервер решает, не рано ли, и
  // ничего не делает чаще раза в сутки. Результат показываем — объединение
  // переписывает названия в истории, и пользователь должен это заметить, а
  // не обнаружить случайно. Ошибку проглатываем: фоновая уборка не должна
  // ломать сохранение чека.
  runProductDedupe()
    .then((result) => {
      if (result && result.merged > 0) {
        useToastStore.getState().show(translate('svc_products_merged', { count: result.merged }));
      }
    })
    .catch(() => {});

  const checked = await autoCheckShoppingList(userId, recognized.items);
  const show = useToastStore.getState().show;
  const store = recognized.storeName?.trim();
  if (checked > 0) {
    // Число вынесено в подстановку, а не склеено со словом: в английском
    // формы другие, и собирать фразу из кусков в коде значит сломать её
    // в любом языке, кроме русского.
    show(
      store
        ? translate('svc_receipt_done_checked', { store, count: checked })
        : translate('svc_receipt_done', {}) + ` (${checked})`,
    );
  } else {
    show(store ? translate('svc_receipt_done_store', { store }) : translate('svc_receipt_done'));
  }
}

// Модель иногда пишет валюту символом с чека («Kč», «€») вместо кода ISO.
// Тогда «Kč» не совпадало с основной «CZK», курс для несуществующей валюты
// не находился, и почти каждый чек получал предупреждение «курс недоступен».
const CURRENCY_SYMBOLS: Record<string, string> = {
  'KČ': 'CZK', 'KC': 'CZK', 'КЧ': 'CZK',
  '€': 'EUR', 'EURO': 'EUR',
  '$': 'USD', 'US$': 'USD',
  '£': 'GBP',
  'ZŁ': 'PLN', 'ZL': 'PLN',
  '₴': 'UAH', 'ГРН': 'UAH',
  '₽': 'RUB', 'РУБ': 'RUB',
  'FT': 'HUF',
  'CHF': 'CHF',
};

function normalizeCurrency(raw: string | null | undefined, fallback: string): string {
  const value = (raw ?? '').trim().replace(/\.$/, '').toUpperCase();
  if (!value) return fallback;
  if (/^[A-Z]{3}$/.test(value)) return value;
  return CURRENCY_SYMBOLS[value] ?? fallback;
}

async function fetchRate(from: string, to: string): Promise<number | null> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const rate = data?.rates?.[to];
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
  } catch {
    return null;
  }
}

type DuplicateReceipt = {
  purchase_date: string | null;
  total_amount: number | null;
  currency: string | null;
};

/**
 * Ищет уже сохранённый чек с тем же отпечатком.
 *
 * Себя исключаем обязательно: при пересканировании хеш уже записан прошлым
 * проходом, и чек нашёл бы сам себя.
 *
 * Ограничения по времени скана нет, в отличие от прежней версии. Отпечаток
 * включает магазин, дату и время покупки — совпадение означает тот же самый
 * чек, когда бы его ни сфотографировали. Чек без времени теоретически может
 * совпасть с другим (тот же магазин, день, сумма и первые товары), но мы
 * только помечаем, а не удаляем, так что цена ошибки — лишняя пометка.
 */
async function findDuplicate(
  userId: string,
  receiptHash: string,
  exceptReceiptId: string,
  recognized: RecognizedReceipt,
): Promise<DuplicateReceipt | null> {
  const { data } = await supabase
    .from('receipts')
    .select('purchase_date, total_amount, currency')
    .eq('user_id', userId)
    .eq('receipt_hash', receiptHash)
    .neq('id', exceptReceiptId)
    .limit(1)
    .maybeSingle();
  if (data) return data;

  // Отпечаток включает дату и время, а их модель часто не находит (у Tesco
  // дата внизу чека). Тогда тот же чек, снятый в другой день, получал другой
  // отпечаток и проходил мимо — на живых данных так задвоились четыре чека.
  // Запасная проверка: тот же магазин, тот же итог и то же число позиций.
  if (!recognized.totalAmount) return null;
  const store = (recognized.storeName ?? '').trim().toLowerCase();
  const { data: candidates } = await supabase
    .from('receipts')
    .select('id, store_name, purchase_date, total_amount, currency, receipt_items(count)')
    .eq('user_id', userId)
    .eq('total_amount', recognized.totalAmount)
    .neq('id', exceptReceiptId)
    .limit(10);
  for (const row of (candidates ?? []) as unknown as (DuplicateReceipt & {
    store_name: string | null;
    receipt_items: { count: number }[];
  })[]) {
    const sameStore = (row.store_name ?? '').trim().toLowerCase().split(/\s+/)[0] === store.split(/\s+/)[0];
    const sameCount = (row.receipt_items?.[0]?.count ?? -1) === recognized.items.length;
    if (sameStore && sameCount) return row;
  }
  return null;
}

function computeHash(recognized: RecognizedReceipt): string {
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
