import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedProgressBar } from '../../components/ui/AnimatedProgressBar';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { FadeInView } from '../../components/ui/FadeInView';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Sparkline } from '../../components/charts/Sparkline';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { supabase } from '../../services/api/supabaseClient';
import { fetchMonthlyCategoryBreakdown } from '../../services/analytics/categoryBreakdown';
import { useAuthStore } from '../../store/authStore';
import { useLimitsStore } from '../../store/limitsStore';
import { useLocaleStore } from '../../store/localeStore';
import { colors, getCategoryColor } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type ProductRow = {
  cleaned_name: string;
  price: number;
  quantity: number;
  weight_value: number | null;
  weight_unit: string | null;
  receipt: { exchange_rate: number | null; purchase_date: string | null; created_at: string } | null;
};

function isSameMonth(dateStr: string | null, createdAt: string, now: Date) {
  const d = dateStr ? new Date(dateStr) : new Date(createdAt);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

type Props = NativeStackScreenProps<AppStackParamList, 'Category'>;

export function CategoryDetailScreen({ route, navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const { categoryName } = route.params;
  const userId = useAuthStore((state) => state.session?.user.id);
  const limits = useLimitsStore((state) => state.limits);
  const fetchLimits = useLimitsStore((state) => state.fetch);

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [totalAll, setTotalAll] = useState(0);
  const [currency, setCurrency] = useState('');
  const [loading, setLoading] = useState(true);

  // useFocusEffect, а не useEffect: если категорию открыть повторно (в т.ч.
  // после только что отсканированного чека), React Navigation при navigate()
  // на тот же route может вернуть на уже смонтированный экран вместо нового
  // — без этого список товаров оставался бы старым, не увидев новую покупку.
  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!userId) return;
        fetchLimits(userId);
        const [{ data }, breakdown] = await Promise.all([
          supabase
            .from('receipt_items')
            .select(
              'cleaned_name, price, quantity, weight_value, weight_unit, receipt:receipts(exchange_rate, purchase_date, created_at)',
            )
            .eq('user_id', userId)
            .eq('category_name', categoryName),
          fetchMonthlyCategoryBreakdown(userId),
        ]);
        const now = new Date();
        const monthRows = ((data as unknown as ProductRow[]) ?? []).filter(
          (r) => r.receipt && isSameMonth(r.receipt.purchase_date, r.receipt.created_at, now),
        );
        setRows(monthRows);
        setTotalAll(breakdown.entries.reduce((sum, e) => sum + e.total, 0));
        setCurrency(breakdown.currency);
        setLoading(false);
      }
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, categoryName]),
  );

  const categoryTotal = rows.reduce((sum, r) => sum + r.price * (r.receipt?.exchange_rate ?? 1), 0);
  const percentOfAll = totalAll > 0 ? (categoryTotal / totalAll) * 100 : 0;
  const limit = limits.find((l) => l.category_name === categoryName);
  const limitPercent = limit && limit.amount > 0 ? (categoryTotal / limit.amount) * 100 : 0;

  // Раньше обрезалось до топ-5 («Популярные товары») — пользователь
  // ожидает видеть тут ВСЁ, что куплено в категории, не только самое
  // дорогое, поэтому список больше не режется.
  const popular = useMemo(() => {
    const byName = new Map<string, { total: number; count: number; weight: number; weightUnit: string | null }>();
    for (const row of rows) {
      const entry = byName.get(row.cleaned_name) ?? { total: 0, count: 0, weight: 0, weightUnit: null };
      entry.total += row.price * (row.receipt?.exchange_rate ?? 1);
      entry.count += 1;
      entry.weight += (row.weight_value ?? 0) * (row.quantity || 1);
      if (row.weight_unit) entry.weightUnit = row.weight_unit;
      byName.set(row.cleaned_name, entry);
    }
    return [...byName.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const dailySeries = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const series = new Array(daysInMonth).fill(0);
    for (const row of rows) {
      if (!row.receipt) continue;
      const d = row.receipt.purchase_date ? new Date(row.receipt.purchase_date) : new Date(row.receipt.created_at);
      series[d.getDate() - 1] += row.price * (row.receipt.exchange_rate ?? 1);
    }
    return series;
  }, [rows]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const color = getCategoryColor(categoryName);

  return (
    <View style={styles.container}>
      <ScreenHeader title={translateCategoryName(categoryName, locale)} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView index={0}>
          <View style={styles.summaryCard}>
            <CategoryIcon category={categoryName} size={48} />
            <Text style={styles.total}>
              {categoryTotal.toFixed(0)} {currency}
            </Text>
            <Text style={styles.percentOfAll}>
              {t('category_detail_percent_of_all', { percent: percentOfAll.toFixed(0) })}
            </Text>
          </View>
        </FadeInView>

        {dailySeries.some((v) => v > 0) && (
          <FadeInView index={1}>
            <View style={styles.chartCard}>
              <Text style={styles.sectionTitle}>{t('category_detail_daily_trend')}</Text>
              <View style={styles.chartWrap}>
                <Sparkline data={dailySeries} width={280} height={80} color={color} />
              </View>
            </View>
          </FadeInView>
        )}

        {limit && (
          <FadeInView index={2}>
            <View style={styles.limitCard}>
              <Text style={styles.limitLabel}>
                {t('category_detail_limit_percent', {
                  percent: limitPercent.toFixed(0),
                  amount: limit.amount.toFixed(0),
                  currency: limit.currency,
                })}
              </Text>
              <AnimatedProgressBar percent={limitPercent} />
            </View>
          </FadeInView>
        )}

        <Text style={styles.sectionTitle}>{t('category_detail_popular_products')}</Text>
        <View style={styles.products}>
          {popular.map((product, i) => (
            <FadeInView key={product.name} index={i}>
              <Pressable
                style={styles.productRow}
                onPress={() => navigation.navigate('Product', { productName: product.name })}
              >
                <CategoryIcon category={categoryName} size={40} color={color} />
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>
                    {product.count}{' '}
                    {product.count === 1
                      ? t('category_detail_purchase_singular')
                      : t('category_detail_purchase_plural')}
                    {product.weight > 0 ? ` · ${product.weight.toFixed(0)} ${product.weightUnit ?? 'г'}` : ''}
                  </Text>
                </View>
                <Text style={styles.productTotal}>
                  {product.total.toFixed(0)} {currency}
                </Text>
              </Pressable>
            </FadeInView>
          ))}
          {popular.length === 0 && <Text style={styles.emptyText}>{t('category_detail_empty')}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  total: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  percentOfAll: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  chartWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  limitCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  limitLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  products: {
    gap: 8,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  productMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  productTotal: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
}));
