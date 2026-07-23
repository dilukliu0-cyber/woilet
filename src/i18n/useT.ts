import { useCallback } from 'react';
import { useLocaleStore } from '../store/localeStore';
import { dictionaries, type TranslationKey } from './translations';

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}

// Хук, а не мутируемый singleton (как colors/theme): компонент, вызвавший
// useT(), сам переподписан на смену locale и перерисуется точечно — без
// полного ремоунта дерева и без риска сбросить навигацию (актуально для
// экрана выбора языка в онбординге, где смена должна быть видна «вживую»).
export function useT() {
  const locale = useLocaleStore((state) => state.locale);
  return useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(dictionaries[locale]?.[key] ?? dictionaries.ru[key] ?? key, vars),
    [locale],
  );
}
