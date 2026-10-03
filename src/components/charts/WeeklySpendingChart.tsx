import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import type { ReceiptRecord } from '../../types/receiptRecord';

type Props = {
  receipts: ReceiptRecord[];
  currency: string;
  weekdayLabels: string[];
  intlLocale: string;
  embedded?: boolean;
};

const PLOT_HEIGHT = 190;
const TICK_COUNT = 4;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function niceAxisMaximum(max: number): number {
  if (max <= 0) return 0;
  const roughStep = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= roughStep) ?? 10;
  return step * magnitude * TICK_COUNT;
}

function axisLabel(value: number, intlLocale: string): string {
  return value >= 1000
    ? `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(value / 1000)}k`
    : new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(value);
}

export function WeeklySpendingChart({ receipts, currency, weekdayLabels, intlLocale, embedded = false }: Props) {
  const t = useT();
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index),
  );
  const dayIndex = new Map(days.map((day, index) => [localDateKey(day), index]));
  const totals = Array<number>(7).fill(0);

  for (const receipt of receipts) {
    const key = receipt.purchase_date?.slice(0, 10) ?? localDateKey(new Date(receipt.created_at));
    const index = dayIndex.get(key);
    if (index !== undefined) {
      totals[index] += (receipt.total_amount ?? 0) * (receipt.exchange_rate ?? 1);
    }
  }

  const total = totals.reduce((sum, amount) => sum + amount, 0);
  const axisMax = niceAxisMaximum(Math.max(...totals));
  const dateFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const period = `${days[0].toLocaleDateString(intlLocale, dateFormat)} – ${days[6].toLocaleDateString(intlLocale, dateFormat)}`;
  const totalLabel = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(total);

  return (
    <View style={embedded ? styles.embedded : styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>{t('expenses_week_title')}</Text>
        <Text style={styles.period}>{period}</Text>
      </View>
      <Text style={styles.total}>{totalLabel} {currency}</Text>

      <View style={styles.chart}>
        <View style={styles.plot}>
          {Array.from({ length: TICK_COUNT + 1 }, (_, index) => (
            <View
              key={index}
              style={[styles.gridLine, { top: (index * PLOT_HEIGHT) / TICK_COUNT }]}
            />
          ))}
          <View style={styles.bars}>
            {totals.map((amount, index) => (
              <View key={index} style={styles.dayColumn}>
                {amount > 0 && (
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(4, (amount / axisMax) * PLOT_HEIGHT) },
                    ]}
                  />
                )}
              </View>
            ))}
          </View>
        </View>
        <View style={styles.axis}>
          {Array.from({ length: TICK_COUNT + 1 }, (_, index) => (
            <Text
              key={index}
              style={[styles.axisText, { top: (index * PLOT_HEIGHT) / TICK_COUNT - 8 }]}
            >
              {axisMax === 0 && index < TICK_COUNT
                ? ''
                : axisLabel((axisMax * (TICK_COUNT - index)) / TICK_COUNT, intlLocale)}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.weekdays}>
        {weekdayLabels.map((label, index) => (
          <Text key={index} style={styles.weekday}>{label}</Text>
        ))}
        <View style={styles.axisSpacer} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 20,
  },
  embedded: {
    paddingTop: 35,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  period: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  total: {
    color: colors.textPrimary,
    fontSize: 39,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 30,
  },
  chart: {
    flexDirection: 'row',
    height: PLOT_HEIGHT,
  },
  plot: {
    flex: 1,
    height: PLOT_HEIGHT,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bars: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 25,
    maxWidth: '75%',
    backgroundColor: colors.textPrimary,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  axis: {
    width: 36,
    height: PLOT_HEIGHT,
    position: 'relative',
    paddingLeft: 7,
  },
  axisText: {
    position: 'absolute',
    left: 7,
    color: colors.textSecondary,
    fontSize: 10,
  },
  weekdays: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  weekday: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
  },
  axisSpacer: {
    width: 36,
  },
}));
