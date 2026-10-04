import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';
import { INTL_LOCALE } from '../../i18n/translations';
import { translate } from '../../i18n/translate';
import { useLimitsStore } from '../../store/limitsStore';
import { useLocaleStore } from '../../store/localeStore';
import type { ReceiptRecord } from '../../types/receiptRecord';

// Сводка для виджетов на экране «Домой» и экране блокировки.
//
// Виджет не ходит в базу сам: у него нет сессии пользователя, а держать
// токен ещё и в расширении — лишний риск. Поэтому приложение после каждой
// загрузки данных кладёт короткую готовую сводку в общее хранилище
// (App Group), а виджет только читает и рисует. Цифры на виджете обновятся,
// когда пользователь откроет приложение или отсканирует чек.
//
// Строки переводит JS по той же причине, что и у островка: язык интерфейса
// живёт в настройках приложения, а не в локали телефона.
//
// ВАЖНО: имя группы и ключ должны совпадать с targets/scan/WailetWidgets.swift.
export const APP_GROUP = 'group.com.dilukliu0.wailet';
const SNAPSHOT_KEY = 'snapshot';

const storage = new ExtensionStorage(APP_GROUP);

export type WidgetSnapshot = {
  currency: string;
  monthLabel: string;
  monthSpent: number;
  /** Сумма лимитов по категориям; 0 — бюджет не задан. */
  budget: number;
  todaySpent: number;
  weekTotal: number;
  /** Пн…Вс текущей недели. */
  week: number[];
  weekLabels: string[];
  wallet: number;
  labels: {
    spent: string;
    budgetPercent: string;
    noBudget: string;
    week: string;
    wallet: string;
    today: string;
    scan: string;
    empty: string;
    walletLeft: string;
    perDay: string;
    until: string;
  };
  updatedAt: number;
};

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** День чека: дата покупки, а если её не распознали — дата добавления. */
function receiptDay(receipt: ReceiptRecord): string {
  return receipt.purchase_date?.slice(0, 10) ?? localDateKey(new Date(receipt.created_at));
}

export function buildWidgetSnapshot(input: {
  receipts: ReceiptRecord[];
  currency: string;
  wallet: number;
  weekdayLabels: string[];
}): WidgetSnapshot {
  const now = new Date();
  const monthPrefix = localDateKey(now).slice(0, 7);
  const todayKey = localDateKey(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weekIndex = new Map(
    Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return [localDateKey(day), i] as const;
    }),
  );

  let monthSpent = 0;
  let todaySpent = 0;
  const week = Array<number>(7).fill(0);

  for (const receipt of input.receipts) {
    // Чек ещё распознаётся или не распознался — суммы у него нет или она
    // неверная; в сводку не берём, как и на главном экране.
    if (receipt.status === 'processing' || receipt.status === 'error') continue;
    const amount = (receipt.total_amount ?? 0) * (receipt.exchange_rate ?? 1);
    const day = receiptDay(receipt);
    if (day.startsWith(monthPrefix)) monthSpent += amount;
    if (day === todayKey) todaySpent += amount;
    const index = weekIndex.get(day);
    if (index !== undefined) week[index] += amount;
  }

  const budget = useLimitsStore.getState().limits.reduce((sum, limit) => sum + (limit.amount ?? 0), 0);
  const intlLocale = INTL_LOCALE[useLocaleStore.getState().locale];
  const monthName = new Intl.DateTimeFormat(intlLocale, { month: 'long' }).format(now);

  return {
    currency: input.currency,
    monthLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1),
    monthSpent: Math.round(monthSpent),
    budget: Math.round(budget),
    todaySpent: Math.round(todaySpent),
    weekTotal: Math.round(week.reduce((s, v) => s + v, 0)),
    week: week.map((v) => Math.round(v)),
    weekLabels: input.weekdayLabels.slice(0, 7),
    wallet: Math.round(input.wallet),
    labels: {
      spent: translate('widget_spent'),
      budgetPercent: translate('widget_budget_percent'),
      noBudget: translate('widget_no_budget'),
      week: translate('widget_week'),
      wallet: translate('expenses_wallet'),
      today: translate('widget_today'),
      scan: translate('widget_scan'),
      empty: translate('widget_empty'),
      walletLeft: translate('widget_wallet_left'),
      perDay: translate('widget_per_day'),
      until: translate('widget_until', {
        date: new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'long' }).format(
          new Date(now.getFullYear(), now.getMonth() + 1, 0),
        ),
      }),
    },
    updatedAt: Date.now(),
  };
}

let lastWritten = '';

/** Записать сводку и попросить iOS перерисовать виджеты. На Android и в вебе — ничего. */
export function publishWidgetSnapshot(snapshot: WidgetSnapshot): void {
  if (Platform.OS !== 'ios') return;
  // updatedAt меняется каждый раз — сравниваем без него, чтобы не дёргать
  // перерисовку виджетов при каждом фокусе экрана с теми же цифрами.
  const { updatedAt: _ignored, ...comparable } = snapshot;
  const fingerprint = JSON.stringify(comparable);
  if (fingerprint === lastWritten) return;
  try {
    storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
    ExtensionStorage.reloadWidget();
    lastWritten = fingerprint;
  } catch {
    /* виджеты — украшение, сбой записи не должен трогать приложение */
  }
}
