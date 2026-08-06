import { supabase } from '../api/supabaseClient';

export type DedupeResult = {
  merged: number;
  groups: { canonical: string; aliases: string[]; updated: number }[];
};

/**
 * Просит сервер слить разные написания одного товара («Birell 0.0 Pomelo» и
 * «Birell 0.0 Помело»). Вызывается сама после скана — решение, не рано ли
 * запускаться, принимает сервер, поэтому звать можно свободно.
 */
export async function runProductDedupe(force = false): Promise<DedupeResult | null> {
  const { data, error } = await supabase.functions.invoke<DedupeResult & { skipped?: boolean }>(
    'dedupe-products',
    { body: { force } },
  );

  if (error || !data || data.skipped) return null;
  return { merged: data.merged ?? 0, groups: data.groups ?? [] };
}
