import { Plus, type LucideIcon } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

export type SpeedDialAction = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
};

const FAB_SIZE = 58;
const ITEM_SIZE = 46;
const ITEM_GAP = 12;
const STRIP_PAD = 8;

// Плавающая «+» кнопка: по нажатию из неё, как из рулетки, вверх
// вытягивается полоса, на которой по очереди проявляются действия.
// actions идут сверху вниз (первый — самый верхний на полосе).
export function SpeedDialFab({ actions }: { actions: SpeedDialAction[] }) {
  const [open, setOpen] = useState(false);
  // Один прогресс на всё: высота полосы, поворот «+», появление пунктов.
  const t = useRef(new Animated.Value(0)).current;

  const stripHeight = actions.length * ITEM_SIZE + (actions.length - 1) * ITEM_GAP + STRIP_PAD * 2;

  function toggle() {
    haptics.light();
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(t, {
      toValue,
      friction: 8,
      tension: 60,
      // Без клампа spring перелетает за 0 при закрытии, и над кнопкой
      // остаётся «хвост» полосы.
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }

  function runAction(action: SpeedDialAction) {
    haptics.selection();
    setOpen(false);
    Animated.timing(t, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    action.onPress();
  }

  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });
  const height = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0, stripHeight],
    extrapolate: 'clamp',
  });
  // Прячем полосу целиком у самого нуля — иначе долгое затухание spring
  // оставляет над кнопкой едва заметный «огрызок».
  const stripOpacity = t.interpolate({
    inputRange: [0, 0.06, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const backdropOpacity = t.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <>
      {/* Фон темы отделяет меню от графика и закрывает его по тапу вне действий. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      </Animated.View>

      <View style={styles.corner} pointerEvents="box-none">
        {/* Фон-«рулетка»: пустая полоса, растёт от кнопки вверх. */}
        <Animated.View style={[styles.strip, { height, opacity: stripOpacity }]} pointerEvents="none" />

        {/* Пункты — поверх полосы, подписи свободно висят слева от неё. */}
        <View style={styles.items} pointerEvents={open ? 'box-none' : 'none'}>
          {actions.map((action, i) => {
            const Icon = action.icon;
            // Появляются по очереди снизу вверх (нижний — первым).
            const start = 0.3 + ((actions.length - 1 - i) / actions.length) * 0.45;
            const itemOpacity = t.interpolate({
              inputRange: [start, Math.min(start + 0.25, 1)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
            const itemShift = t.interpolate({
              inputRange: [start, Math.min(start + 0.25, 1)],
              outputRange: [12, 0],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={action.label}
                style={[styles.itemRow, { opacity: itemOpacity, transform: [{ translateY: itemShift }] }]}
              >
                <View style={styles.labelChip}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {action.label}
                  </Text>
                </View>
                <Pressable style={styles.itemButton} onPress={() => runAction(action)}>
                  <Icon color={colors.accent} size={20} strokeWidth={1.9} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <Pressable style={styles.fab} onPress={toggle}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Plus color={colors.background} size={26} strokeWidth={2.25} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: {
    backgroundColor: colors.background,
  },
  corner: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    alignItems: 'flex-end',
  },
  strip: {
    position: 'absolute',
    bottom: FAB_SIZE + 10,
    right: 0,
    width: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  items: {
    position: 'absolute',
    bottom: FAB_SIZE + 10 + STRIP_PAD,
    right: (FAB_SIZE - ITEM_SIZE) / 2,
    gap: ITEM_GAP,
    alignItems: 'flex-end',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    // Подписи не должны упираться в ширину колонки кнопок: на телефоне
    // «Пополнение» обрезалось до «Попол…».
    alignSelf: 'flex-end',
    minWidth: 260,
  },
  itemButton: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelChip: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  labelText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
