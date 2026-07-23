import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sparkline } from '../../components/charts/Sparkline';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { FadeInView } from '../../components/ui/FadeInView';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { StatCard } from '../../components/ui/StatCard';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { supabase } from '../../services/api/supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { colors, getCategoryColor } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type PurchaseRow = {
  price: number;
  quantity: number;
  weight_value: number | null;
  weight_unit: string | null;
  category_name: string;
  receipt: {
    store_name: string | null;
    purchase_date: string | null;
    created_at: string;
    exchange_rate: number | null;
    base_currency: string | null;
    currency: string;
  } | null;
};

type Props = NativeStackScreenProps<AppStackParamList, 'Product'>;

export function ProductScreen({ route, navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const { productName } = route.params;
  const userId = useAuthStore((state) => state.session?.user.id);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!userId) return;
      const { data } = await supabase
        .from('receipt_items')
        .select(
          'price, quantity, weight_value, weight_unit, category_name, receipt:receipts(store_name, purchase_date, created_at, exchange_rate, base_currency, currency)',
        )
        .eq('user_id', userId)
        .eq('cleaned_name', productName);
      setPurchases(((data as unknown as PurchaseRow[]) ?? []).filter((p) => p.receipt));
      setLoading(false);
    }
    load();
  }, [userId, productName]);

  const derived = useMemo(() => {
    const currency = purchases[0]?.receipt?.base_currency ?? purchases[0]?.receipt?.currency ?? '';
    const category = purchases[0]?.category_name ?? 'Другое';
    const basePrices = purchases.map((p) => p.price * (p.receipt?.exchange_rate ?? 1));
    const totalSpent = basePrices.reduce((s, v) => s + v, 0);
    const avgPrice = purchases.length > 0 ? totalSpent / purchases.length : 0;
    const totalWeight = purchases.reduce((s, p) => s + (p.weight_value ?? 0) * (p.quantity || 1), 0);
    const weightUnit = purchases.find((p) => p.weight_unit)?.weight_unit ?? 'г';

    const byStore = new Map<string, { total: number; count: number }>();
    purchases.forEach((p, i) => {
      const store = p.receipt?.store_name ?? t('product_no_store');
      const entry = byStore.get(store) ?? { total: 0, count: 0 };
      entry.total += basePrices[i];
      entry.count += 1;
      byStore.set(store, entry);
    });
    const stores = [...byStore.entries()]
      .map(([store, v]) => ({ store, avg: v.total / v.count }))
      .sort((a, b) => a.avg - b.avg);

    const chronological = purchases
      .map((p, i) => ({
        date: p.receipt?.purchase_date ?? p.receipt?.created_at.slice(0, 10) ?? '',
        store: p.receipt?.store_name ?? t('product_no_store'),
        price: basePrices[i],
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { currency, category, totalSpent, avgPrice, totalWeight, weightUnit, stores, chronological };
  }, [purchases]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const { currency, category, totalSpent, avgPrice, totalWeight, weightUnit, stores, chronological } = derived;
  const priceSeries = chronological.map((h) => h.price);

  return (
    <View style={styles.container}>
      <ScreenHeader title={productName} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView index={0}>
          <View style={styles.summaryCard}>
            <CategoryIcon category={category} size={48} />
            <Text style={styles.total}>
              {totalSpent.toFixed(0)} {currency}
            </Text>
            <Text style={styles.sub}>{t('product_spent_label', { category: translateCategoryName(category, locale) })}</Text>
          </View>
        </FadeInView>

        <FadeInView index={1}>
          <View style={styles.statsRow}>
            <StatCard value={`${purchases.length}`} label={t('product_purchases_label')} />
            {totalWeight > 0 && (
              <StatCard value={`${totalWeight.toFixed(0)} ${weightUnit}`} label={t('product_quantity_label')} />
            )}
            <StatCard value={`${avgPrice.toFixed(0)} ${currency}`} label={t('product_avg_price_label')} />
          </View>
        </FadeInView>

        {priceSeries.length >= 2 && (
          <FadeInView index={2}>
            <View style={styles.chartCard}>
              <Text style={styles.sectionTitle}>{t('product_price_history')}</Text>
              <View style={styles.chartWrap}>
                <Sparkline data={priceSeries} width={300} height={90} color={getCategoryColor(category)} />
              </View>
              <View style={styles.chartMeta}>
                <Text style={styles.chartMetaText}>
                  {t('product_min', { amount: Math.min(...priceSeries).toFixed(0), currency })}
                </Text>
                <Text style={styles.chartMetaText}>
                  {t('product_max', { amount: Math.max(...priceSeries).toFixed(0), currency })}
                </Text>
              </View>
            </View>
          </FadeInView>
        )}

        {stores.length > 1 && (
          <FadeInView index={3}>
            <Text style={styles.sectionTitle}>{t('product_where_cheaper')}</Text>
            <View style={styles.storesRow}>
              {stores.slice(0, 3).map((s, i) => (
                <View key={s.store} style={[styles.storeCard, i === 0 && styles.storeCardBest]}>
                  <Text style={styles.storeName} numberOfLines={1}>
                    {s.store}
                  </Text>
                  <Text style={[styles.storePrice, i === 0 && styles.storePriceBest]}>
                    {s.avg.toFixed(0)} {currency}
                  </Text>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        <Text style={styles.sectionTitle}>{t('product_purchase_history')}</Text>
        <View style={styles.history}>
          {[...chronological].reverse().map((h, i) => (
            <View key={i} style={styles.historyRow}>
              <View>
                <Text style={styles.historyStore}>{h.store}</Text>
                <Text style={styles.historyDate}>{h.date}</Text>
              </View>
              <Text style={styles.historyPrice}>
                {h.price.toFixed(0)} {currency}
              </Text>
            </View>
          ))}
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
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
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
  chartMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  storesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  storeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  storeCardBest: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  storeName: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  storePrice: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  storePriceBest: {
    color: colors.accent,
  },
  history: {
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  historyStore: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  historyDate: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  historyPrice: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
}));
