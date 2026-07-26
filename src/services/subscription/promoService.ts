import { supabase } from '../api/supabaseClient';

export type RedeemFailure = 'not_found' | 'exhausted' | 'already_used' | 'empty' | 'network';

export type RedeemResult = { ok: true; expiresAt: string | null } | { ok: false; reason: RedeemFailure };

/**
 * Активация промокода. Решение принимает сервер: клиент не может ни
 * прочитать список кодов, ни записать себе подписку напрямую.
 */
export async function redeemPromoCode(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    expiresAt?: string | null;
    code?: RedeemFailure;
  }>('redeem-promo', { body: { code } });

  if (error) {
    // supabase-js кладёт тело неуспешного ответа только в error.context,
    // в data его нет. Без разбора контекста конкретная причина («код уже
    // использован») потерялась бы и пользователь видел бы общую ошибку сети.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const body = await response.json();
        if (body?.code) return { ok: false, reason: body.code as RedeemFailure };
      } catch {
        // Тело не JSON — ниже отдадим общую ошибку.
      }
    }
    return { ok: false, reason: 'network' };
  }

  if (!data?.ok) return { ok: false, reason: data?.code ?? 'not_found' };
  return { ok: true, expiresAt: data.expiresAt ?? null };
}
