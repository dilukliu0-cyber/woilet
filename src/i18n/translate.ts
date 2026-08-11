import { useLocaleStore } from '../store/localeStore';
import { dictionaries, type TranslationKey } from './translations';

// Перевод вне React-дерева. Хук useT() тут не подходит: сообщения об
// ошибках и тосты рождаются в сервисах (сканирование чека, сохранение,
// уведомления), а это обычные функции, а не компоненты. Читаем язык из
// стора напрямую — состояние одно и то же, просто без подписки.
//
// В компонентах по-прежнему нужен useT(): он перерисовывает экран при
// смене языка, а эта функция вернёт строку на языке, актуальном в момент
// вызова, и обновляться не будет.
export function translate(key: TranslationKey, vars?: Record<string, string | number>): string {
  const locale = useLocaleStore.getState().locale;
  const text = dictionaries[locale]?.[key] ?? dictionaries.ru[key] ?? key;
  if (!vars) return text;

  let result = text;
  for (const [name, value] of Object.entries(vars)) {
    result = result.replace(`{${name}}`, String(value));
  }
  return result;
}

/**
 * Склонение существительного после числа. Нужно для русского и чешского:
 * «1 товар», «2 товара», «5 товаров». В английском формы всего две,
 * поэтому many там совпадает с few.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
