import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORY_NAMES } from '../../utils/categoryIconMap';
import { deleteReceiptItem } from '../../services/receipts/receiptsService';
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
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { productKey } from '../../utils/productKey';
import { formatTotals } from '../../utils/measure';

type PurchaseRow = {
  id: string;
  cleaned_name: string;
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

  const unitLabels = { g: t('unit_g'), kg: t('unit_kg'), ml: t('unit_ml'), l: t('unit_l') };

  // useFocusEffect, а не useEffect — та же причина, что в CategoryDetailScreen:
  // без него список покупок не подхватывал только что отсканированный чек,
  // если экран уже был в стеке для того же товара.
  const [reloadTick, setReloadTick] = useState(0);
  const reload = () => setReloadTick((n) => n + 1);
  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!userId) return;
        // Точное совпадение по названию теряло покупки, записанные чуть
        // иначе («Филе куриное» против «Куриное филе»), а вместе с ними —
        // половину истории цен. Поэтому выбираем покупки пользователя и
        // сопоставляем по каноническому ключу.
        const wanted = productKey(productName);
        const { data } = await supabase
          .from('receipt_items')
          .select(
            'id, cleaned_name, price, quantity, weight_value, weight_unit, category_name, receipt:receipts(store_name, purchase_date, created_at, exchange_rate, base_currency, currency)',
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(2000);

        const rows = ((data as unknown as PurchaseRow[]) ?? []).filter(
          (row) => row.receipt && productKey(row.cleaned_name) === wanted,
        );
        setPurchases(rows);
        setLoading(false);
      }
      load();
    }, [userId, productName, reloadTick]),
  );

  const derived = useMemo(() => {
    const currency = purchases[0]?.receipt?.base_currency ?? purchases[0]?.receipt?.currency ?? '';
    const category = purchases[0]?.category_name ?? 'Другое';
    const basePrices = purchases.map((p) => p.price * (p.receipt?.exchange_rate ?? 1));
    const totalSpent = basePrices.reduce((s, v) => s + v, 0);
    // Цена в строке — за всю строку («3 × 24.90» = 74.70). Средняя и график
    // раньше считались по ней и завышались на каждой покупке нескольких
    // штук; считаем за одну штуку.
    const totalQty = purchases.reduce((s, p) => s + (p.quantity > 0 ? p.quantity : 1), 0);
    const avgPrice = totalQty > 0 ? totalSpent / totalQty : 0;
    // Складывать weight_value как есть нельзя: единицы в базе разные
    // («г» и «кг», «л» и «L»), а подпись бралась из первой покупки —
    // 665 г и 0.4 кг превращались в «665.4 кг».
    const totalMeasure = formatTotals(
      purchases.map((p) => ({ value: p.weight_value, unit: p.weight_unit, quantity: p.quantity })),
      unitLabels,
    );

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
        id: p.id,
        row: p,
        date: p.receipt?.purchase_date ?? p.receipt?.created_at.slice(0, 10) ?? '',
        store: p.receipt?.store_name ?? t('product_no_store'),
        price: basePrices[i],
        unitPrice: basePrices[i] / (p.quantity > 0 ? p.quantity : 1),
        quantity: p.quantity,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { currency, category, totalSpent, avgPrice, totalMeasure, stores, chronological };
  }, [purchases, unitLabels.g]);

  // --- Редактор товара: название и категория сразу во всех его покупках ---
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  function openProductEdit() {
    setEditName(productName);
    setEditCategory(purchases[0]?.category_name ?? 'Другое');
    setProductEditOpen(true);
  }
  async function saveProduct() {
    const name = editName.trim();
    if (!name || purchases.length === 0) return;
    await supabase
      .from('receipt_items')
      .update({ cleaned_name: name, category_name: editCategory })
      .in('id', purchases.map((p) => p.id));
    setProductEditOpen(false);
    if (name !== productName) navigation.setParams({ productName: name });
    else reload();
  }

  // --- Редактор одной покупки: цена за строку, количество, удаление ---
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRow | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  function openPurchaseEdit(row: PurchaseRow) {
    setEditingPurchase(row);
    setEditPrice(String(row.price));
    setEditQty(String(row.quantity || 1));
    setConfirmDelete(false);
  }
  async function savePurchase() {
    if (!editingPurchase) return;
    const price = Number(editPrice.replace(',', '.'));
    const quantity = Number(editQty.replace(',', '.'));
    const goodPrice = Number.isFinite(price) ? price : editingPurchase.price;
    const goodQty = Number.isFinite(quantity) && quantity > 0 ? quantity : editingPurchase.quantity || 1;
    await supabase
      .from('receipt_items')
      .update({
        price: goodPrice,
        quantity: goodQty,
        unit_price: Math.round((goodPrice / goodQty) * 100) / 100,
      })
      .eq('id', editingPurchase.id);
    setEditingPurchase(null);
    reload();
  }
  async function removePurchase() {
    if (!editingPurchase) return;
    // Подтверждение вторым нажатием: системное окно в вебе не работает.
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteReceiptItem(editingPurchase.id);
    setEditingPurchase(null);
    reload();
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const { currency, category, totalSpent, avgPrice, totalMeasure, stores, chronological } = derived;
  const priceSeries = chronological.map((h) => h.unitPrice);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={productName}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => openProductEdit()} hitSlop={8}>
            <Text style={styles.headerAction}>{t('receipt_detail_edit')}</Text>
          </Pressable>
        }
      />

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
            {totalMeasure !== '' && (
              <StatCard value={totalMeasure} label={t('product_quantity_label')} />
            )}
            <StatCard value={`${avgPrice.toFixed(0)} ${currency}`} label={t('product_avg_price_label')} />
          </View>
        </FadeInView>

        {priceSeries.length >= 2 && (
          <FadeInView index={2}>
            <View style={styles.chartCard}>
              <Text style={styles.sectionTitle}>{t('product_price_history')}</Text>
              <View style={styles.chartWrap}>
                <Sparkline data={priceSeries} width={300} height={90} color={colors.textPrimary} />
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
            <Pressable key={h.id ?? i} style={styles.historyRow} onPress={() => openPurchaseEdit(h.row)}>
              <View>
                <Text style={styles.historyStore}>{h.store}</Text>
                <Text style={styles.historyDate}>
                  {h.date}
                  {h.quantity > 1 ? ` · ${h.quantity} × ${h.unitPrice.toFixed(2)}` : ''}
                </Text>
              </View>
              <Text style={styles.historyPrice}>
                {h.price.toFixed(0)} {currency}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={productEditOpen} transparent animationType="slide" onRequestClose={() => setProductEditOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setProductEditOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('product_edit_title')}</Text>
          <Text style={styles.fieldLabel}>{t('product_edit_name')}</Text>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
          <Text style={styles.fieldLabel}>{t('product_edit_category')}</Text>
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={styles.chips}>
            {CATEGORY_NAMES.map((name) => (
              <Pressable
                key={name}
                style={[styles.chip, editCategory === name && styles.chipActive]}
                onPress={() => setEditCategory(name)}
              >
                <Text style={[styles.chipText, editCategory === name && styles.chipTextActive]}>
                  {translateCategoryName(name, locale)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.hint}>{t('product_edit_hint', { count: purchases.length })}</Text>
          <Pressable style={styles.primary} onPress={saveProduct}>
            <Text style={styles.primaryText}>{t('common_save')}</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={editingPurchase !== null} transparent animationType="slide" onRequestClose={() => setEditingPurchase(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditingPurchase(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {editingPurchase?.receipt?.store_name ?? t('product_no_store')} · {editingPurchase?.receipt?.purchase_date ?? ''}
          </Text>
          <Text style={styles.fieldLabel}>{t('product_edit_price')}</Text>
          <TextInput style={styles.input} value={editPrice} onChangeText={setEditPrice} keyboardType="decimal-pad" />
          <Text style={styles.fieldLabel}>{t('product_edit_quantity')}</Text>
          <TextInput style={styles.input} value={editQty} onChangeText={setEditQty} keyboardType="decimal-pad" />
          <Pressable style={styles.primary} onPress={savePurchase}>
            <Text style={styles.primaryText}>{t('common_save')}</Text>
          </Pressable>
          <Pressable style={[styles.secondary, confirmDelete && styles.secondaryDanger]} onPress={removePurchase}>
            <Text style={[styles.secondaryText, confirmDelete && styles.primaryText]}>
              {confirmDelete ? t('product_edit_delete_confirm') : t('common_delete')}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  headerAction: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    padding: 20,
    paddingBottom: 36,
    gap: 8,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.background },
  hint: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  primaryText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  secondary: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  secondaryDanger: { backgroundColor: colors.accent },
  secondaryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
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
