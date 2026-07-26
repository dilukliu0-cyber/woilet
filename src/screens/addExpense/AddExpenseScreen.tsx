import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import {
  fetchFrequentItems,
  fetchRecentStores,
  guessCategory,
  type FrequentItem,
} from '../../services/expenses/manualEntrySuggestions';
import { addManualExpense } from '../../services/receipts/receiptsService';
import { useAuthStore } from '../../store/authStore';
import { useCategoriesStore } from '../../store/categoriesStore';
import { useLocaleStore } from '../../store/localeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { colors } from '../../theme/colors';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

type DayOffset = 0 | 1 | 2;

function isoDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function AddExpenseScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const currency = useSettingsStore((state) => state.settings?.currency ?? 'CZK');
  const categories = useCategoriesStore((state) => state.categories);
  const fetchCategories = useCategoriesStore((state) => state.fetch);
  const showToast = useToastStore((state) => state.show);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState<DayOffset>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [frequent, setFrequent] = useState<FrequentItem[]>([]);
  const [recentStores, setRecentStores] = useState<string[]>([]);
  // Категорию подставили сами — показываем подпись и не перетираем ручной
  // выбор пользователя при дальнейшем наборе названия.
  const [categoryAutoPicked, setCategoryAutoPicked] = useState(false);

  const priceRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      fetchCategories(userId);
      fetchFrequentItems(userId).then(setFrequent);
      fetchRecentStores(userId).then(setRecentStores);
    }, [userId, fetchCategories]),
  );

  // Сумма — главное поле, поэтому клавиатура открывается сразу на ней:
  // название часто ставится одним тапом по «часто покупаете».
  useEffect(() => {
    const timer = setTimeout(() => priceRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  function handleNameChange(value: string) {
    setName(value);
    // Автоподбор работает, пока пользователь не выбрал категорию руками.
    if (categoryName && !categoryAutoPicked) return;
    const guess = guessCategory(value, frequent);
    if (guess) {
      setCategoryName(guess);
      setCategoryAutoPicked(true);
    } else if (categoryAutoPicked) {
      setCategoryName(null);
      setCategoryAutoPicked(false);
    }
  }

  function applyFrequentItem(item: FrequentItem) {
    haptics.selection();
    setName(item.name);
    setCategoryName(item.categoryName);
    setCategoryAutoPicked(true);
    if (!price.trim()) setPrice(item.lastPrice.toFixed(2).replace(/\.00$/, ''));
    setError(null);
  }

  function pickCategory(value: string) {
    haptics.selection();
    setCategoryName(value);
    setCategoryAutoPicked(false);
  }

  function resetForm() {
    setName('');
    setPrice('');
    setQuantity('1');
    setCategoryName(null);
    setCategoryAutoPicked(false);
    setError(null);
    priceRef.current?.focus();
  }

  async function handleSave(addAnother: boolean) {
    const parsedPrice = Number(price.replace(',', '.'));
    const parsedQuantity = Number(quantity.replace(',', '.')) || 1;

    if (!name.trim()) {
      setError(t('add_expense_name_required'));
      return;
    }
    if (!parsedPrice || parsedPrice <= 0) {
      setError(t('add_expense_price_required'));
      return;
    }
    if (!categoryName) {
      setError(t('add_expense_category_required'));
      return;
    }
    if (!userId) return;

    setSaving(true);
    const { error: saveError } = await addManualExpense(userId, {
      name: name.trim(),
      price: parsedPrice,
      quantity: parsedQuantity,
      categoryName,
      storeName: store.trim() || null,
      currency,
      purchaseDate: isoDate(dayOffset),
    });
    setSaving(false);

    if (saveError) {
      haptics.warning();
      setError(saveError);
      return;
    }
    haptics.success();

    if (addAnother) {
      // Магазин и дату намеренно оставляем: подряд обычно вносят покупки
      // из одного похода в один магазин.
      showToast(t('add_expense_saved'));
      resetForm();
      fetchFrequentItems(userId).then(setFrequent);
      return;
    }
    navigation.goBack();
  }

  const dateOptions: { offset: DayOffset; label: string }[] = [
    { offset: 0, label: t('add_expense_date_today') },
    { offset: 1, label: t('add_expense_date_yesterday') },
    { offset: 2, label: t('add_expense_date_before') },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('add_expense_title')}</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Сумма — крупно и первым делом: это то, ради чего экран открывают. */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>{t('add_expense_amount_label')}</Text>
          <View style={styles.amountRow}>
            <TextInput
              ref={priceRef}
              style={styles.amountInput}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.amountCurrency}>{currency}</Text>
          </View>
          <Text style={styles.freeHint}>{t('add_expense_free_hint')}</Text>
        </View>

        {frequent.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>{t('add_expense_frequent')}</Text>
            <View style={styles.chipRow}>
              {frequent.map((item) => (
                <Pressable key={item.name} style={styles.chip} onPress={() => applyFrequentItem(item)}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <TextField
          label={t('add_expense_name_label')}
          value={name}
          onChangeText={handleNameChange}
          placeholder={t('add_expense_name_placeholder')}
        />

        <View style={styles.block}>
          <Text style={styles.sectionLabel}>{t('add_expense_date_label')}</Text>
          <View style={styles.chipRow}>
            {dateOptions.map((option) => (
              <Pressable
                key={option.offset}
                style={[styles.chip, dayOffset === option.offset && styles.chipSelected]}
                onPress={() => {
                  haptics.selection();
                  setDayOffset(option.offset);
                }}
              >
                <Text style={[styles.chipText, dayOffset === option.offset && styles.chipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <TextField
          label={t('add_expense_store_label')}
          value={store}
          onChangeText={setStore}
          placeholder="Lidl"
        />
        {recentStores.length > 0 && (
          <View style={styles.chipRow}>
            {recentStores.map((item) => (
              <Pressable
                key={item}
                style={[styles.chip, store.trim().toLowerCase() === item.toLowerCase() && styles.chipSelected]}
                onPress={() => {
                  haptics.selection();
                  setStore(item);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    store.trim().toLowerCase() === item.toLowerCase() && styles.chipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextField
          label={t('add_expense_quantity_label')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
          placeholder="1"
        />

        <View style={styles.categoryHeader}>
          <Text style={styles.sectionLabel}>{t('add_expense_category_label')}</Text>
          {categoryAutoPicked && categoryName && (
            <View style={styles.guessTag}>
              <Sparkles color={colors.accent} size={11} />
              <Text style={styles.guessText}>{t('add_expense_category_guessed')}</Text>
            </View>
          )}
        </View>
        <View style={styles.grid}>
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            const selected = categoryName === category.name;
            return (
              <Pressable
                key={category.id}
                style={[styles.tile, selected && styles.tileSelected]}
                onPress={() => pickCategory(category.name)}
              >
                <View style={styles.tileIconWrap}>
                  <Icon color={selected ? colors.accent : colors.textSecondary} size={20} />
                  {selected && (
                    <View style={styles.tileCheck}>
                      <Check color={colors.background} size={10} />
                    </View>
                  )}
                </View>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {translateCategoryName(category.name, locale)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.actions}>
          <PrimaryButton label={t('common_save')} onPress={() => handleSave(false)} loading={saving} />
          <PrimaryButton
            label={t('add_expense_save_and_more')}
            variant="secondary"
            onPress={() => handleSave(true)}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 4,
  },
  amountLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '700',
    paddingVertical: 4,
  },
  amountCurrency: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
  },
  freeHint: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  block: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.accent,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guessTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guessText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '30%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileSelected: {
    borderColor: colors.accent,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tileCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
}));
