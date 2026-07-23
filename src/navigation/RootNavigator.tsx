import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { AppStackParamList } from './types';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore } from '../store/themeStore';
import type { Locale } from '../i18n/translations';
import { colors, getCurrentTheme, type ThemeName } from '../theme/colors';
import { AppStack } from './AppStack';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { themedStyles } from '../theme/themedStyles';
import { registerForPushNotifications } from '../services/notifications/pushNotifications';

// Deep link: woilet://scan открывает сканер напрямую — для «Касания задней
// панели» iPhone (Back Tap → быстрая команда «Открыть URL»).
const linking: LinkingOptions<AppStackParamList> = {
  prefixes: [Linking.createURL('/'), 'woilet://'],
  config: {
    // При холодном старте по ссылке под сканером остаются табы,
    // чтобы «назад» вёл на Главную, а не закрывал приложение.
    initialRouteName: 'Tabs',
    screens: {
      Scan: 'scan',
    },
  },
};

// Считается на каждый рендер: после смены темы (ремоунт по key в App)
// подхватывает актуальную палитру.
function buildNavigationTheme(): Theme {
  const base = getCurrentTheme() === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.error,
    },
  };
}

export function RootNavigator() {
  const session = useAuthStore((state) => state.session);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const init = useAuthStore((state) => state.init);

  const settings = useSettingsStore((state) => state.settings);
  const isSettingsLoading = useSettingsStore((state) => state.isLoading);
  const fetchSettings = useSettingsStore((state) => state.fetch);
  const resetSettings = useSettingsStore((state) => state.reset);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setLocale = useLocaleStore((state) => state.setLocale);

  useEffect(() => {
    init();
  }, [init]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userId) {
      fetchSettings(userId);
      registerForPushNotifications(userId);
    } else {
      resetSettings();
    }
  }, [userId, fetchSettings, resetSettings]);

  const themeSetting = settings?.theme;
  useEffect(() => {
    if (themeSetting === 'light' || themeSetting === 'dark') {
      setTheme(themeSetting as ThemeName);
    }
  }, [themeSetting, setTheme]);

  const languageSetting = settings?.language;
  useEffect(() => {
    if (languageSetting === 'ru' || languageSetting === 'cs' || languageSetting === 'en') {
      setLocale(languageSetting as Locale);
    }
  }, [languageSetting, setLocale]);

  const isLoading = isInitializing || (!!session && isSettingsLoading);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  function renderContent() {
    if (!session) return <AuthNavigator />;
    if (!settings?.onboarding_completed) return <OnboardingNavigator />;
    return <AppStack />;
  }

  return (
    <NavigationContainer theme={buildNavigationTheme()} linking={linking}>
      {renderContent()}
    </NavigationContainer>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
