import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { addManualExpense } from '../../services/receipts/receiptsService';
import { useAuthStore } from '../../store/authStore';
import { useCategoriesStore } from '../../store/categoriesStore';
import { useLocaleStore } from '../../store/localeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { colors } from '../../theme/colors';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

export function AddExpenseScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const currency = useSettingsStore((state) => state.settings?.currency ?? 'CZK');
  const categories = useCategoriesStore((state) => state.categories);
  const fetchCategories = useCategoriesStore((state) => state.fetch);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchCategories(userId);
    }, [userId, fetchCategories]),
  );

  async function handleSave() {
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
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('add_expense_title')}</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TextField
          label={t('add_expense_name_label')}
          value={name}
          onChangeText={setName}
          placeholder={t('add_expense_name_placeholder')}
        />
        <TextField
          label={t('add_expense_price_label', { currency })}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="150"
        />
        <TextField label={t('add_expense_store_label')} value={store} onChangeText={setStore} placeholder="Lidl" />
        <TextField
          label={t('add_expense_quantity_label')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
          placeholder="1"
        />

        <Text style={styles.sectionLabel}>{t('add_expense_category_label')}</Text>
        <View style={styles.grid}>
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            const selected = categoryName === category.name;
            return (
              <Pressable
                key={category.id}
                style={[styles.tile, selected && styles.tileSelected]}
                onPress={() => setCategoryName(category.name)}
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

        <PrimaryButton label={t('common_save')} onPress={handleSave} loading={saving} />
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
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
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
}));
