import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Receipt, Sparkles, ShoppingCart } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ExpensesScreen } from '../screens/expenses/ExpensesScreen';
import { ShoppingScreen } from '../screens/shopping/ShoppingScreen';
import { useT } from '../i18n/useT';
import { colors } from '../theme/colors';
import { themedStyles } from '../theme/themedStyles';
import { haptics } from '../utils/haptics';

const Tab = createBottomTabNavigator();

// Свой таб-бар ради главной кнопки «Расходы» ровно по центру: слева чат,
// справа покупки — 1:1, центр не съезжает. Профиль — не вкладка, а
// аватарка в шапке экрана «Расходы».
function CenterTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;

        function onPress() {
          haptics.selection();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }

        if (route.name === 'Expenses') {
          return (
            <View key={route.key} style={styles.centerSlot}>
              <Pressable style={styles.centerButton} onPress={onPress}>
                <Receipt color={colors.background} size={26} strokeWidth={2} />
              </Pressable>
              <Text style={[styles.label, focused ? styles.labelActive : styles.labelIdle]}>
                {options.title}
              </Text>
            </View>
          );
        }

        const tint = focused ? colors.accent : colors.textTertiary;
        return (
          <Pressable key={route.key} style={styles.slot} onPress={onPress}>
            {options.tabBarIcon?.({ focused, color: tint, size: 24 })}
            <Text style={[styles.label, { color: tint }]}>{options.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  const t = useT();
  return (
    <Tab.Navigator
      initialRouteName="Expenses"
      tabBar={(props) => <CenterTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'shift' }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: t('tabs_chat'), tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} /> }}
      />
      <Tab.Screen name="Expenses" component={ExpensesScreen} options={{ title: t('tabs_expenses') }} />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{ title: t('tabs_shopping'), tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingTop: 4,
  },
  centerSlot: {
    flex: 1.4,
    alignItems: 'center',
    gap: 3,
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.background,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.accent,
  },
  labelIdle: {
    color: colors.textTertiary,
  },
}));
