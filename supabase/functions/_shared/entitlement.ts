// Проверка тарифа и квот — общая для всех edge-функций, которые тратят
// деньги на Gemini. Единственное авторитетное место: клиент своё состояние
// подписки только показывает, разрешает доступ всегда сервер.
//
// Импортируется как '../_shared/entitlement.ts' — Supabase CLI при деплое
// затягивает относительные импорты в бандл функции.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Сколько сканов чеков в календарный месяц доступно на бесплатном тарифе.
// Это авторитетное значение; в приложении есть его копия для отображения
// счётчика (src/services/subscription/subscriptionService.ts) — при изменении
// править оба места.
export const FREE_SCAN_LIMIT = 10;

export type UsageKind = 'scan' | 'chat' | 'digest' | 'shopping';

export type Entitlement = {
  isPro: boolean;
  tier: 'free' | 'pro';
  status: string;
  expiresAt: string | null;
};

const ACTIVE_STATUSES = ['active', 'in_trial', 'in_grace'];

/**
 * Текущий тариф пользователя. Отсутствие строки в subscriptions = free
 * (строка заводится только когда подписка реально появилась).
 */
export async function getEntitlement(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<Entitlement> {
  const { data } = await serviceClient
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return { isPro: false, tier: 'free', status: 'inactive', expiresAt: null };
  }

  const notExpired = !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
  const isPro = data.tier === 'pro' && ACTIVE_STATUSES.includes(data.status) && notExpired;

  return {
    isPro,
    tier: data.tier === 'pro' ? 'pro' : 'free',
    status: data.status,
    expiresAt: data.expires_at ?? null,
  };
}

/** Начало текущего календарного месяца в UTC — совпадает с date_trunc('month', now()) на сервере Supabase. */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Сколько вызовов данного типа пользователь сделал в текущем месяце. */
export async function countMonthlyUsage(
  serviceClient: SupabaseClient,
  userId: string,
  kind: UsageKind,
): Promise<number> {
  const { count } = await serviceClient
    .from('ai_api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', monthStartIso());

  return count ?? 0;
}

export type QuotaDecision =
  | { allowed: true; isPro: boolean; used: number; limit: number | null }
  | { allowed: false; reason: 'quota_exceeded'; used: number; limit: number };

/**
 * Можно ли сделать ещё один скан. У Pro лимита нет, у free — FREE_SCAN_LIMIT
 * в календарный месяц.
 */
export async function checkScanQuota(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<QuotaDecision> {
  const entitlement = await getEntitlement(serviceClient, userId);
  if (entitlement.isPro) {
    return { allowed: true, isPro: true, used: 0, limit: null };
  }

  const used = await countMonthlyUsage(serviceClient, userId, 'scan');
  if (used >= FREE_SCAN_LIMIT) {
    return { allowed: false, reason: 'quota_exceeded', used, limit: FREE_SCAN_LIMIT };
  }

  return { allowed: true, isPro: false, used, limit: FREE_SCAN_LIMIT };
}

/**
 * Стандартный ответ, когда функция доступна только по подписке. Код
 * 402 Payment Required — клиент по нему показывает экран подписки, не
 * путая это с обычной ошибкой сети или отказом авторизации.
 */
export function proRequiredResponse(corsHeaders: Record<string, string>, detail?: unknown) {
  return new Response(
    JSON.stringify({
      error: 'Доступно по подписке Woilet Pro',
      code: 'pro_required',
      ...(detail && typeof detail === 'object' ? detail : {}),
    }),
    { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
