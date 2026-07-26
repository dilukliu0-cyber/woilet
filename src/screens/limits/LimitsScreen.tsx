import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedProgressBar } from '../../components/ui/AnimatedProgressBar';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { FadeInView } from '../../components/ui/FadeInView';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import { fetchCategoryMonthlyAverage, fetchMonthlyCategoryBreakdown } from '../../services/analytics/categoryBreakdown';
import { useAuthStore } from '../../store/authStore';
import { useLimitsStore } from '../../store/limitsStore';
import { useLocaleStore } from '../../store/localeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { colors, progressColor } from '../../theme/colors';
import { CATEGORY_ICON_BY_NAME, CATEGORY_NAMES } from '../../utils/categoryIconMap';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { themedStyles } from '../../theme/themedStyles';

type Props = { onBack: () => void };

export function LimitsScreen({ onBack }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const currency = useSettingsStore((state) => state.settings?.currency ?? '');
  const limits = useLimitsStore((state) => state.limits);
  const fetchLimits = useLimitsStore((state) => state.fetch);
  const upsertLimit = useLimitsStore((state) => state.upsertLimit);
  const deleteLimit = useLimitsStore((state) => state.deleteLimit);

  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedAmount, setSuggestedAmount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      fetchLimits(userId);
      fetchMonthlyCategoryBreakdown(userId).then(({ entries }) => {
        const map: Record<string, number> = {};
        entries.forEach((e) => (map[e.categoryName] = e.total));
        setSpentByCategory(map);
      });
    }, [userId, fetchLimits]),
  );

  const availableCategories = CATEGORY_NAMES.filter(
    (name) => !limits.some((l) => l.category_name === name),
  );

  function openModal() {
    const first = availableCategories[0] ?? null;
    setSelectedCategory(first);
    setAmount('');
    setError(null);
    setSuggestedAmount(null);
    setModalVisible(true);
    if (first) loadSuggestion(first);
  }

  function selectCategory(name: string) {
    setSelectedCategory(name);
    setSuggestedAmount(null);
    loadSuggestion(name);
  }

  async function loadSuggestion(category: string) {
    if (!userId) return;
    const avg = await fetchCategoryMonthlyAverage(userId, category);
    setSuggestedAmount(avg && avg > 0 ? avg : null);
  }

  function applySuggestion() {
    if (suggestedAmount) setAmount(String(Math.round(suggestedAmount)));
  }

  async function handleSave() {
    if (!userId || !selectedCategory) return;
    const parsed = Number(amount.replace(',', '.'));
    if (!parsed || parsed <= 0) {
      setError(t('limits_amount_required'));
      return;
    }
    setSaving(true);
    const err = await upsertLimit(userId, selectedCategory, parsed, currency || 'CZK');
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setModalVisible(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={onBack}>
          <ArrowLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('limits_title')}</Text>
        <Pressable style={styles.iconButton} onPress={openModal} disabled={availableCategories.length === 0}>
          <Plus color={availableCategories.length === 0 ? colors.textSecondary : colors.accent} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {limits.length === 0 && <Text style={styles.emptyText}>{t('limits_empty')}</Text>}

        {limits.map((limit, index) => {
          const spent = spentByCategory[limit.category_name] ?? 0;
          const percent = limit.amount > 0 ? (spent / limit.amount) * 100 : 0;

          return (
            <FadeInView key={limit.id} index={index}>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <CategoryIcon category={limit.category_name} size={40} />
                  <View style={styles.cardTopInfo}>
                    <Text style={styles.categoryName}>{translateCategoryName(limit.category_name, locale)}</Text>
                    <Text style={styles.amountText}>
                      {spent.toFixed(0)} / {limit.amount.toFixed(0)} {limit.currency}
                    </Text>
                  </View>
                  <Text style={[styles.percent, { color: progressColor(percent) }]}>{percent.toFixed(0)}%</Text>
                  <Pressable onPress={() => deleteLimit(limit.id)} hitSlop={8} style={styles.deleteButton}>
                    <Trash2 color={colors.textTertiary} size={16} />
                  </Pressable>
                </View>
                <AnimatedProgressBar percent={percent} />
                {percent >= 100 ? (
                  <Text style={[styles.warningText, { color: colors.error }]}>
                    {t('limits_exceeded_by', { amount: (spent - limit.amount).toFixed(0), currency: limit.currency })}
                  </Text>
                ) : percent >= 90 ? (
                  <Text style={[styles.warningText, { color: colors.error }]}>
                    {t('limits_left_until', { amount: (limit.amount - spent).toFixed(0), currency: limit.currency })}
                  </Text>
                ) : percent >= 75 ? (
                  <Text style={[styles.warningText, { color: colors.warning }]}>
                    {t('limits_almost_full', { amount: (limit.amount - spent).toFixed(0), currency: limit.currency })}
                  </Text>
                ) : null}
              </View>
            </FadeInView>
          );
        })}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.kavFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('limits_new_title')}</Text>
            <ScrollView style={styles.categoryList} contentContainerStyle={styles.categoryListContent}>
              <View style={styles.tileGrid}>
                {availableCategories.map((name) => {
                  const Icon = getCategoryIcon(CATEGORY_ICON_BY_NAME[name] ?? 'ellipsis');
                  const selected = selectedCategory === name;
                  return (
                    <Pressable
                      key={name}
                      style={[styles.tile, selected && styles.tileSelected]}
                      onPress={() => selectCategory(name)}
                    >
                      <View style={styles.tileIconWrap}>
                        <Icon color={selected ? colors.accent : colors.textSecondary} size={22} />
                        {selected && (
                          <View style={styles.tileCheck}>
                            <Check color={colors.background} size={10} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.tileLabel} numberOfLines={2}>
                        {translateCategoryName(name, locale)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <TextField
              label={t('limits_amount_label', { currency: currency || 'CZK' })}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="1000"
            />
            {suggestedAmount !== null && (
              <Pressable style={styles.suggestionRow} onPress={applySuggestion}>
                <Text style={styles.suggestionText}>
                  {t('limits_suggestion', { amount: Math.round(suggestedAmount), currency: currency || 'CZK' })}
                </Text>
                <Text style={styles.suggestionAction}>{t('limits_suggestion_apply')}</Text>
              </Pressable>
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
            <PrimaryButton
              label={t('common_save')}
              onPress={handleSave}
              loading={saving}
              disabled={!selectedCategory}
            />
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    gap: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTopInfo: {
    flex: 1,
  },
  categoryName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  amountText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  percent: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    paddingLeft: 4,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '500',
  },
  kavFill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
    maxHeight: '80%',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  categoryList: {
    maxHeight: 320,
  },
  categoryListContent: {
    paddingBottom: 8,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '30%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileSelected: {
    borderColor: colors.accent,
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tileCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
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
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
  suggestionAction: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
}));
