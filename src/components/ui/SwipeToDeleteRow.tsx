import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Оттянуть влево дальше этого порога и отпустить — чек удаляется сразу,
// без отдельного тапа по корзинке и без диалога: сам факт того, что чек
// решительно оттянули далеко (а не задели пальцем при скролле — это
// отсекают failOffsetY/activeOffsetX ниже), и есть осознанное действие.
const COMMIT_THRESHOLD = -170;
const MAX_DRAG = -300;
// Короткий свайп не удаляет, а открывает красную кнопку «Удалить» шириной
// OPEN_WIDTH: её видно и можно нажать — иначе непонятно, что там спрятано.
const OPEN_WIDTH = -92;
const OPEN_SNAP = -46;

type Props = {
  children: ReactNode;
  onDelete: () => void | Promise<void>;
  style?: object;
};

export function SwipeToDeleteRow({ children, onDelete, style }: Props) {
  const t = useT();
  // Положение = сохранённое смещение (строка открыта или закрыта) + текущий
  // жест. После отпускания жест вливается в смещение.
  const offset = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const translateX = useRef(Animated.add(offset, dragX)).current;
  const openRef = useRef(false);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const measuredHeight = useRef(0);
  const [splitting, setSplitting] = useState(false);

  // Анимация «расщепления»: верхняя половина карточки улетает вверх-влево,
  // нижняя — вниз-влево, одновременно схлопывается высота строки — вместо
  // простого сдвига получается ощущение, что чек буквально разламывается.
  const topShift = useRef(new Animated.Value(0)).current;
  const bottomShift = useRef(new Animated.Value(0)).current;
  const splitOpacity = useRef(new Animated.Value(1)).current;

  const onGestureEvent = Animated.event<PanGestureHandlerGestureEvent>(
    [{ nativeEvent: { translationX: dragX } }],
    { useNativeDriver: true },
  );

  function onHandlerStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    const start = openRef.current ? OPEN_WIDTH : 0;
    const final = start + event.nativeEvent.translationX;
    offset.setValue(final);
    dragX.setValue(0);
    if (final < COMMIT_THRESHOLD) {
      commitDelete();
      return;
    }
    openRef.current = final < OPEN_SNAP;
    Animated.spring(offset, {
      toValue: openRef.current ? OPEN_WIDTH : 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  }

  function commitDelete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    heightAnim.setValue(measuredHeight.current);
    setSplitting(true);
    Animated.parallel([
      Animated.timing(offset, { toValue: -400, duration: 260, useNativeDriver: true }),
      Animated.timing(topShift, { toValue: -36, duration: 260, useNativeDriver: true }),
      Animated.timing(bottomShift, { toValue: 36, duration: 260, useNativeDriver: true }),
      Animated.timing(splitOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(heightAnim, { toValue: 0, duration: 260, useNativeDriver: false, delay: 70 }),
    ]).start(() => onDelete());
  }

  const clampedTranslateX = translateX.interpolate({
    inputRange: [MAX_DRAG, 0, 1],
    outputRange: [MAX_DRAG, 0, 0],
    extrapolate: 'clamp',
  });
  const iconOpacity = translateX.interpolate({
    inputRange: [-50, -16, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  const iconScale = translateX.interpolate({
    inputRange: [COMMIT_THRESHOLD, OPEN_WIDTH, 0],
    outputRange: [1.2, 1, 0.8],
    extrapolate: 'clamp',
  });

  const height = measuredHeight.current;

  return (
    <Animated.View
      style={splitting ? { height: heightAnim, overflow: 'hidden' } : undefined}
      onLayout={(e) => {
        if (!splitting) measuredHeight.current = e.nativeEvent.layout.height;
      }}
    >
      <View style={[styles.wrapper, splitting ? styles.wrapperSplitting : styles.wrapperClipped, style]}>
        <View style={styles.actionsBackdrop}>
          <Pressable style={styles.deleteButton} onPress={commitDelete} hitSlop={6}>
            <Animated.View style={{ alignItems: 'center', opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
              <Trash2 color={colors.background} size={24} />
              <Text style={styles.deleteLabel} numberOfLines={1}>
                {t('common_delete')}
              </Text>
            </Animated.View>
          </Pressable>
        </View>

        {splitting ? (
          <>
            <Animated.View
              style={[
                styles.splitPiece,
                {
                  height: height / 2,
                  opacity: splitOpacity,
                  transform: [{ translateY: topShift }, { rotate: '-4deg' }],
                },
              ]}
            >
              <View style={{ height }}>{children}</View>
            </Animated.View>
            <Animated.View
              style={[
                styles.splitPiece,
                {
                  height: height / 2,
                  top: height / 2,
                  opacity: splitOpacity,
                  transform: [{ translateY: bottomShift }, { rotate: '4deg' }],
                },
              ]}
            >
              <View style={{ height, marginTop: -height / 2 }}>{children}</View>
            </Animated.View>
          </>
        ) : (
          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetX={[-14, 14]}
            failOffsetY={[-8, 8]}
          >
            <Animated.View style={{ width: '100%', transform: [{ translateX: clampedTranslateX }] }}>
              {children}
            </Animated.View>
          </PanGestureHandler>
        )}
      </View>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  // В состоянии покоя враппер обрезан ровно по силуэту карточки — иначе
  // красная подложка под ней (actionsBackdrop) и сама карточка скруглены
  // независимо друг от друга и на реальном устройстве может проступать
  // тонкий красный ободок по углам. Во время «расщепления» обрезку снимаем,
  // иначе половинки чека не смогут вылететь за пределы строки.
  wrapperClipped: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  wrapperSplitting: {
    overflow: 'visible',
  },
  // Во всю ширину строки (а не узкая полоска у края) — так при любом
  // рассинхроне ширины карточки со враппером под ней никогда не мелькнёт
  // случайный красный обвод: цвет и так везде одинаковый.
  actionsBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: colors.textPrimary,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  deleteButton: {
    width: -OPEN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  splitPiece: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
    width: '100%',
  },
}));
