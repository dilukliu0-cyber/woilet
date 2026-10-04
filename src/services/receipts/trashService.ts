import { supabase } from '../api/supabaseClient';

// Корзина: удалённый чек вместе с позициями копируется в trashed_receipts
// (функция trash_receipt в базе) и убирается из основных таблиц, поэтому
// ни статистика, ни списки его не видят и ни один запрос не надо менять.
// Фото чека остаётся в хранилище до окончательного удаления.
export const TRASH_RETENTION_DAYS = 30;

export type TrashedReceipt = {
  id: string;
  deleted_at: string;
  receipt: {
    store_name: string | null;
    purchase_date: string | null;
    total_amount: number | null;
    currency: string | null;
    image_path: string | null;
  };
  items: unknown[];
};

export async function moveReceiptToTrash(receiptId: string): Promise<string | null> {
  const { error } = await supabase.rpc('trash_receipt', { p_receipt_id: receiptId });
  return error ? error.message : null;
}

export async function restoreReceipt(trashId: string): Promise<string | null> {
  const { error } = await supabase.rpc('restore_receipt', { p_trash_id: trashId });
  return error ? error.message : null;
}

export async function deleteForever(entry: TrashedReceipt): Promise<string | null> {
  const { error } = await supabase.from('trashed_receipts').delete().eq('id', entry.id);
  if (error) return error.message;
  if (entry.receipt.image_path) {
    await supabase.storage.from('receipts').remove([entry.receipt.image_path]);
  }
  return null;
}

/** Загружает корзину и заодно стирает записи старше срока хранения. */
export async function loadTrash(): Promise<TrashedReceipt[]> {
  const { data } = await supabase
    .from('trashed_receipts')
    .select('id, deleted_at, receipt, items')
    .order('deleted_at', { ascending: false });
  const all = (data ?? []) as TrashedReceipt[];
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000;
  const expired = all.filter((e) => new Date(e.deleted_at).getTime() < cutoff);
  await Promise.all(expired.map((e) => deleteForever(e)));
  return all.filter((e) => !expired.includes(e));
}
