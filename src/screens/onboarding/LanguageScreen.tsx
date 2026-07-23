import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SelectableRow } from '../../components/ui/SelectableRow';
import { useT } from '../../i18n/useT';
import { LOCALES, type Locale } from '../../i18n/translations';
import type { OnboardingStackParamList } from '../../navigation/types';
import { useLocaleStore } from '../../store/localeStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Language'>;

export function LanguageScreen({ navigation }: Props) {
  const t = useT();
  const setLocale = useLocaleStore((state) => state.setLocale);
  const [selected, setSelected] = useState<Locale>('ru');

  // Меняем язык интерфейса сразу по тапу — видно на этом же экране,
  // а не только после завершения онбординга.
  function choose(code: Locale) {
    setSelected(code);
    setLocale(code);
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('onboarding_language_title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding_language_subtitle')}</Text>

        <View style={styles.list}>
          {LOCALES.map((lang) => (
            <SelectableRow
              key={lang.code}
              label={lang.label}
              selected={selected === lang.code}
              onPress={() => choose(lang.code)}
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={t('common_next')} onPress={() => navigation.navigate('Currency', { language: selected })} />
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
    paddingHorizontal: 24,
    paddingTop: 80,
    gap: 8,
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
