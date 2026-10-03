import { User, type LucideIcon } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

export type ProfileMenuAction = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

const AVATAR_SIZE = 40;
const ITEM_HEIGHT = 44;
const ITEM_GAP = 6;
const STRIP_PAD = 8;
const STRIP_WIDTH = 190;

// Аватарка в шапке — та же логика «рулетки», что и у плавающей «+»:
// тап вытягивает полосу с пунктами, только вниз, а не вверх (кнопка
// в верхнем углу, расти вверх ей некуда).
export function ProfileMenuButton({
  avatarUri,
  fallbackLetter,
  actions,
  scrollY,
}: {
  avatarUri: string | null;
  fallbackLetter: string;
  actions: ProfileMenuAction[];
  scrollY?: Animated.Value;
}) {
  const [open, setOpen] = useState(false);
  const t = useRef(new Animated.Value(0)).current;

  const stripHeight = actions.length * ITEM_HEIGHT + (actions.length - 1) * ITEM_GAP + STRIP_PAD * 2;

  function toggle() {
    haptics.light();
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(t, {
      toValue,
      friction: 8,
      tension: 60,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }

  function runAction(action: ProfileMenuAction) {
    haptics.selection();
    setOpen(false);
    Animated.timing(t, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    action.onPress();
  }

  const height = t.interpolate({ inputRange: [0, 1], outputRange: [0, stripHeight], extrapolate: 'clamp' });
  const stripOpacity = t.interpolate({
    inputRange: [0, 0.06, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const backdropOpacity = t.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      </Animated.View>

      <Animated.View
        style={[styles.corner, scrollY && { transform: [{ translateY: Animated.multiply(scrollY, -1) }] }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={toggle}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              {fallbackLetter ? (
                <Text style={styles.avatarLetter}>{fallbackLetter.toUpperCase()}</Text>
              ) : (
                <User color={colors.accent} size={18} strokeWidth={1.9} />
              )}
            </View>
          )}
        </Pressable>

        {/* Полоса-«рулетка» растёт вниз от аватарки. */}
        <Animated.View style={[styles.strip, { height, opacity: stripOpacity }]} pointerEvents="none" />

        <View style={styles.items} pointerEvents={open ? 'box-none' : 'none'}>
          {actions.map((action, i) => {
            const Icon = action.icon;
            // Появляются сверху вниз — ближний к аватарке первым.
            const start = 0.3 + (i / actions.length) * 0.45;
            const itemOpacity = t.interpolate({
              inputRange: [start, Math.min(start + 0.25, 1)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
            const itemShift = t.interpolate({
              inputRange: [start, Math.min(start + 0.25, 1)],
              outputRange: [-10, 0],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={action.label}
                style={[styles.itemRow, { opacity: itemOpacity, transform: [{ translateY: itemShift }] }]}
              >
                <Pressable style={styles.itemButton} onPress={() => runAction(action)}>
                  <Icon color={action.destructive ? colors.error : colors.accent} size={17} strokeWidth={1.9} />
                  <Text style={[styles.itemLabel, action.destructive && styles.itemLabelDestructive]}>
                    {action.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: {
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    top: 58,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 20,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  avatarLetter: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  strip: {
    position: 'absolute',
    top: AVATAR_SIZE + 8,
    right: 0,
    width: STRIP_WIDTH,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  items: {
    position: 'absolute',
    top: AVATAR_SIZE + 8 + STRIP_PAD,
    right: 0,
    width: STRIP_WIDTH,
    gap: ITEM_GAP,
  },
  itemRow: {
    paddingHorizontal: 8,
  },
  itemButton: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemLabelDestructive: {
    color: colors.error,
  },
}));
