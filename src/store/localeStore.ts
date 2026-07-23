import { create } from 'zustand';
import type { Locale } from '../i18n/translations';

type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

// Язык интерфейса — отдельный реактивный стор (а не мутируемый singleton,
// как тема): экран выбора языка в онбординге меняет его «вживую», без
// полного ремоунта дерева, который сбросил бы навигацию на первый шаг.
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'ru',
  setLocale: (locale) => set({ locale }),
}));
