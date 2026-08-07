import { create } from 'zustand';
import { supabase } from '../services/api/supabaseClient';
import type { UserSettings } from '../types/userSettings';

type SettingsState = {
  settings: UserSettings | null;
  isLoading: boolean;
  fetch: (userId: string) => Promise<void>;
  updateSettings: (
    patch: Partial<
      Pick<
        UserSettings,
        | 'language'
        | 'currency'
        | 'region'
        | 'notifications_enabled'
        | 'ai_tips_enabled'
        | 'theme'
        | 'nickname'
        | 'avatar_path'
        | 'chart_style'
        | 'home_chart'
        | 'translate_items'
        | 'shopping_reminders_enabled'
      >
    >,
  ) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  reset: () => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: true,

  fetch: async (userId) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Не удалось загрузить настройки пользователя', error);
    }
    set({ settings: data, isLoading: false });
  },

  updateSettings: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const { data, error } = await supabase
      .from('user_settings')
      .update(patch)
      .eq('user_id', current.user_id)
      .select()
      .single();

    if (error) {
      console.error('Не удалось сохранить настройки пользователя', error);
      return;
    }
    set({ settings: data });
  },

  completeOnboarding: async () => {
    const current = get().settings;
    if (!current) return;
    const { data, error } = await supabase
      .from('user_settings')
      .update({ onboarding_completed: true })
      .eq('user_id', current.user_id)
      .select()
      .single();

    if (error) {
      console.error('Не удалось завершить онбординг', error);
      return;
    }
    set({ settings: data });
  },

  reset: () => set({ settings: null, isLoading: true }),
}));
