import { Check } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../store/toastStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Всплывающее уведомление сверху. Смонтировано один раз в корне приложения,
// читает сообщение из toastStore и само прячется через 3 секунды.
export function Toast() {
  const message = useToastStore((state) => state.message);
  const hide = useToastStore((state) => state.hide);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (!message) return;

    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
    const timer = setTimeout(() => {
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }).start(() => hide());
    }, 3000);

    return () => clearTimeout(timer);
  }, [message, translateY, hide]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, { top: insets.top + 8, transform: [{ translateY }] }]}>
      <Animated.View style={styles.iconWrap}>
        <Check color={colors.background} size={16} />
      </Animated.View>
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
}));
