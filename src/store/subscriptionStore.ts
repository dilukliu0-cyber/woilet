import { create } from 'zustand';
import { supabase } from '../services/api/supabaseClient';

// Копия серверного лимита из supabase/functions/_shared/entitlement.ts.
// Здесь она нужна только чтобы нарисовать счётчик «осталось N сканов»;
// решение, пропускать ли скан, принимает сервер. При изменении лимита
// править оба места.
export const FREE_SCAN_LIMIT = 10;

const ACTIVE_STATUSES = ['active', 'in_trial', 'in_grace'];

type SubscriptionState = {
  isPro: boolean;
  status: string;
  expiresAt: string | null;
  scansUsed: number;
  isLoading: boolean;
  loaded: boolean;
  fetch: (userId: string) => Promise<void>;
  reset: () => void;
};

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  isPro: false,
  status: 'inactive',
  expiresAt: null,
  scansUsed: 0,
  isLoading: false,
  loaded: false,

  fetch: async (userId) => {
    set({ isLoading: true });

    // Обе таблицы читаются напрямую: RLS отдаёт пользователю только его
    // собственные строки, а писать в них он всё равно не может.
    const [{ data: sub }, { count }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('tier, status, expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('ai_api_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('kind', 'scan')
        .gte('created_at', monthStartIso()),
    ]);

    const notExpired = !sub?.expires_at || new Date(sub.expires_at).getTime() > Date.now();
    const isPro = !!sub && sub.tier === 'pro' && ACTIVE_STATUSES.includes(sub.status) && notExpired;

    set({
      isPro,
      status: sub?.status ?? 'inactive',
      expiresAt: sub?.expires_at ?? null,
      scansUsed: count ?? 0,
      isLoading: false,
      loaded: true,
    });
  },

  reset: () =>
    set({ isPro: false, status: 'inactive', expiresAt: null, scansUsed: 0, isLoading: false, loaded: false }),
}));

/** Сколько сканов осталось на бесплатном тарифе (у Pro — null, безлимит). */
export function scansLeft(isPro: boolean, scansUsed: number): number | null {
  if (isPro) return null;
  return Math.max(0, FREE_SCAN_LIMIT - scansUsed);
}
