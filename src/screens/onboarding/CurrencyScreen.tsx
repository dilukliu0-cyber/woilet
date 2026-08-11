import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SelectableRow } from '../../components/ui/SelectableRow';
import { useT } from '../../i18n/useT';
import { useLocaleStore } from '../../store/localeStore';
import { INTL_LOCALE } from '../../i18n/translations';
import type { OnboardingStackParamList } from '../../navigation/types';
import { useSettingsStore } from '../../store/settingsStore';
import { CURRENCIES, currencyName } from '../../utils/currencies';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Currency'>;

export function CurrencyScreen({ route }: Props) {
  const t = useT();
  const intlLocale = INTL_LOCALE[useLocaleStore((state) => state.locale)];
  const { language } = route.params;
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  const [selected, setSelected] = useState('CZK');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

  async function handleFinish() {
    setLoading(true);
    await updateSettings({ language, currency: selected });
    await completeOnboarding();
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('onboarding_currency_title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding_currency_subtitle')}</Text>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('onboarding_currency_search_placeholder')}
          placeholderTextColor={colors.textSecondary}
        />
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list}>
          {visible.map((currency) => (
            <SelectableRow
              key={currency.code}
              label={`${currencyName(currency.code, intlLocale)} (${currency.symbol}) · ${currency.code}`}
              selected={selected === currency.code}
              onPress={() => setSelected(currency.code)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={t('common_done')} onPress={handleFinish} loading={loading} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    gap: 8,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 4,
  },
  listScroll: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
  },
  list: {
    gap: 10,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
}));
