import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { INTL_LOCALE, translateCategoryName } from '../../i18n/translations';
import { useT } from '../../i18n/useT';
import type { AppStackParamList } from '../../navigation/types';
import { addManualExpense } from '../../services/receipts/receiptsService';
import { useAuthStore } from '../../store/authStore';
import { useCategoriesStore } from '../../store/categoriesStore';
import { useLocaleStore } from '../../store/localeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function AddExpenseScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const currency = useSettingsStore((state) => state.settings?.currency ?? 'CZK');
  const categories = useCategoriesStore((state) => state.categories);
  const fetchCategories = useCategoriesStore((state) => state.fetch);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(() => localDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchCategories(userId);
    }, [userId, fetchCategories]),
  );

  const intlLocale = INTL_LOCALE[locale];
  const selectedDate = dateFromKey(purchaseDate);
  const todayKey = localDateKey(new Date());
  const dateLabel = purchaseDate === todayKey
    ? t('add_expense_date_today')
    : selectedDate.toLocaleDateString(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' });
  const firstWeekday = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 1 + index).toLocaleDateString(intlLocale, { weekday: 'short' }),
  );

  function openCalendar() {
    Keyboard.dismiss();
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setCalendarOpen(true);
  }

  async function handleSave() {
    const parsedPrice = Number(price.trim().replace(',', '.'));
    if (!name.trim()) {
      setError(t('add_expense_name_required'));
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError(t('add_expense_price_required'));
      return;
    }
    if (!categoryName) {
      setError(t('add_expense_category_required'));
      return;
    }
    if (!userId || saving) return;

    setSaving(true);
    const { error: saveError } = await addManualExpense(userId, {
      name: name.trim(),
      price: parsedPrice,
      quantity: 1,
      categoryName,
      storeName: null,
      currency,
      purchaseDate,
    });
    setSaving(false);
    if (saveError) {
      haptics.warning();
      setError(saveError);
      return;
    }
    haptics.success();
    navigation.goBack();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityLabel={t('common_cancel')}>
          <ArrowLeft color={colors.textPrimary} size={23} />
        </Pressable>
        <Text style={styles.topTitle}>{t('add_expense_title')}</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.amountCard}>
          <Text style={styles.fieldLabel}>{t('add_expense_amount_label')}</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={styles.amountInput}
              value={price}
              onChangeText={(value) => { setPrice(value); setError(null); }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel={t('add_expense_amount_label')}
            />
            <Text style={styles.amountCurrency}>{currency}</Text>
          </View>
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.fieldLabel}>{t('add_expense_name_label')}</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={(value) => { setName(value); setError(null); }}
            placeholder={t('add_expense_name_placeholder')}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
          />
        </View>

        <Pressable style={styles.choiceRow} onPress={openCalendar}>
          <View style={styles.choiceIcon}><CalendarDays color={colors.textPrimary} size={20} /></View>
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>{t('add_expense_date_label')}</Text>
            <Text style={styles.choiceValue}>{dateLabel}</Text>
          </View>
          <ChevronRight color={colors.textPrimary} size={20} />
        </Pressable>

        <Pressable
          style={styles.choiceRow}
          onPress={() => { Keyboard.dismiss(); setCategoriesOpen(true); }}
        >
          <View style={styles.choiceIcon}>
            {categoryName
              ? (() => {
                  const selected = categories.find((category) => category.name === categoryName);
                  const Icon = getCategoryIcon(selected?.icon ?? 'ellipsis');
                  return <Icon color={colors.textPrimary} size={20} />;
                })()
              : <ChevronDown color={colors.textPrimary} size={20} />}
          </View>
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>{t('add_expense_category_label')}</Text>
            <Text style={styles.choiceValue}>
              {categoryName ? translateCategoryName(categoryName, locale) : t('add_expense_choose_category')}
            </Text>
          </View>
          <ChevronRight color={colors.textPrimary} size={20} />
        </Pressable>

        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.saveButton}>
          <PrimaryButton label={t('common_save')} onPress={handleSave} loading={saving} />
        </View>
      </ScrollView>

      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setCalendarOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_expense_date_label')}</Text>
              <Pressable style={styles.closeButton} onPress={() => setCalendarOpen(false)} accessibilityLabel={t('common_cancel')}>
                <X color={colors.textPrimary} size={22} />
              </Pressable>
            </View>
            <View style={styles.monthHeader}>
              <Pressable style={styles.monthArrow} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                <ChevronLeft color={colors.textPrimary} size={22} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {calendarMonth.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable style={styles.monthArrow} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                <ChevronRight color={colors.textPrimary} size={22} />
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekdays.map((weekday, index) => (
                <Text key={index} style={styles.weekday}>{weekday}</Text>
              ))}
              {calendarCells.map((day, index) => {
                const key = day === null ? '' : localDateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                const selected = key === purchaseDate;
                const today = key === todayKey;
                return (
                  <View key={index} style={styles.daySlot}>
                    {day !== null && (
                      <Pressable
                        style={[styles.dayButton, today && styles.todayButton, selected && styles.selectedDay]}
                        onPress={() => {
                          haptics.selection();
                          setPurchaseDate(key);
                          setCalendarOpen(false);
                        }}
                      >
                        <Text style={[styles.dayText, selected && styles.selectedDayText]}>{day}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={categoriesOpen} transparent animationType="fade" onRequestClose={() => setCategoriesOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setCategoriesOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_expense_category_label')}</Text>
              <Pressable style={styles.closeButton} onPress={() => setCategoriesOpen(false)} accessibilityLabel={t('common_cancel')}>
                <X color={colors.textPrimary} size={22} />
              </Pressable>
            </View>
            <ScrollView style={styles.categoryScroll} contentContainerStyle={styles.categoryList}>
              {categories.map((category) => {
                const Icon = getCategoryIcon(category.icon);
                const selected = categoryName === category.name;
                return (
                  <Pressable
                    key={category.id}
                    style={[styles.categoryOption, selected && styles.selectedCategory]}
                    onPress={() => {
                      haptics.selection();
                      setCategoryName(category.name);
                      setError(null);
                      setCategoriesOpen(false);
                    }}
                  >
                    <Icon color={selected ? colors.background : colors.textPrimary} size={21} />
                    <Text style={[styles.categoryOptionText, selected && styles.selectedCategoryText]}>
                      {translateCategoryName(category.name, locale)}
                    </Text>
                    {selected && <Check color={colors.background} size={18} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 22, paddingTop: 36, paddingBottom: 50, gap: 16 },
  amountCard: { borderWidth: 2, borderColor: colors.cardBorder, borderRadius: 24, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16, marginBottom: 12 },
  fieldLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  amountInput: { flex: 1, color: colors.textPrimary, fontSize: 48, fontWeight: '700', paddingVertical: 8, minWidth: 0 },
  amountCurrency: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  nameBlock: { gap: 10 },
  nameInput: { minHeight: 56, borderWidth: 2, borderColor: colors.border, borderRadius: 16, color: colors.textPrimary, fontSize: 17, paddingHorizontal: 17 },
  choiceRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16 },
  choiceIcon: { width: 28, alignItems: 'center' },
  choiceText: { flex: 1, gap: 3 },
  choiceLabel: { color: colors.textSecondary, fontSize: 12 },
  choiceValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  errorText: { color: colors.error, fontSize: 13 },
  saveButton: { marginTop: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 2, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, maxHeight: '82%' },
  modalHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  monthArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  monthTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.textSecondary, fontSize: 12, fontWeight: '700', paddingVertical: 10 },
  daySlot: { width: '14.2857%', height: 46, alignItems: 'center', justifyContent: 'center' },
  dayButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  todayButton: { borderWidth: 1, borderColor: colors.border },
  selectedDay: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  dayText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  selectedDayText: { color: colors.background },
  categoryScroll: { flexGrow: 0 },
  categoryList: { gap: 8, paddingBottom: 8 },
  categoryOption: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 16 },
  selectedCategory: { backgroundColor: colors.textPrimary },
  categoryOptionText: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  selectedCategoryText: { color: colors.background },
}));
