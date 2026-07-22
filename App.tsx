import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toast } from './src/components/ui/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initSentry, Sentry } from './src/services/monitoring/sentry';
import { useThemeStore } from './src/store/themeStore';
import { getCurrentTheme } from './src/theme/colors';

initSentry();

function App() {
  const themeVersion = useThemeStore((state) => state.version);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* key: смена темы полностью пересоздаёт дерево — themedStyles пересчитаются */}
        <Fragment key={themeVersion}>
          <StatusBar style={getCurrentTheme() === 'light' ? 'dark' : 'light'} />
          <RootNavigator />
          <Toast />
        </Fragment>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
