import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Подписи над карточкой — «барабан», как колесо таймера в iPhone.
//
// Сам он ничего не прокручивает: положение берёт из ленты экранов под ним
// (progress = номер экрана, дробный во время движения). Поэтому подписи и
// экраны физически не могут разойтись — раньше у барабана была своя
// прокрутка, карточка догоняла его своей анимацией, и при быстрой смене всё
// ломалось. Тянуть можно и за подписи: жест пересылается ленте.
const ITEM_WIDTH = 132;

export function WheelSelector({
  labels,
  progress,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  labels: string[];
  /** Номер экрана, дробный во время прокрутки. */
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  onSelect: (index: number) => void;
  onDragStart: () => void;
  /** Сдвиг пальца, пересчитанный в доли экрана. */
  onDragMove: (pages: number) => void;
  onDragEnd: (velocityPages: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const dragged = useRef(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          dragged.current = true;
          onDragStart();
        },
        // Палец влево — колесо крутится к следующему пункту.
        onPanResponderMove: (_, g) => onDragMove(-g.dx / ITEM_WIDTH),
        onPanResponderRelease: (_, g) => {
          onDragEnd((-g.vx * 1000) / ITEM_WIDTH);
          setTimeout(() => (dragged.current = false), 50);
        },
        onPanResponderTerminate: () => {
          onDragEnd(0);
          dragged.current = false;
        },
      }),
    [onDragStart, onDragMove, onDragEnd],
  );

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      {width > 0 &&
        labels.map((label, i) => {
          const inputRange = [i - 2, i - 1, i, i + 1, i + 2];
          const translateX = progress.interpolate({
            inputRange,
            outputRange: [2 * ITEM_WIDTH, ITEM_WIDTH, 0, -ITEM_WIDTH, -2 * ITEM_WIDTH],
            extrapolate: 'extend',
          });
          const rotateY = progress.interpolate({
            inputRange,
            outputRange: ['-62deg', '-42deg', '0deg', '42deg', '62deg'],
            extrapolate: 'clamp',
          });
          const scale = progress.interpolate({
            inputRange,
            outputRange: [0.62, 0.78, 1, 0.78, 0.62],
            extrapolate: 'clamp',
          });
          const opacity = progress.interpolate({
            inputRange,
            outputRange: [0.1, 0.35, 1, 0.35, 0.1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={label}
              style={[
                styles.item,
                {
                  left: (width - ITEM_WIDTH) / 2,
                  opacity,
                  transform: [{ translateX }, { perspective: 600 }, { rotateY }, { scale }],
                },
              ]}
            >
              <Pressable
                style={styles.hit}
                onPress={() => {
                  if (!dragged.current) onSelect(i);
                }}
              >
                <Animated.Text numberOfLines={1} style={styles.label}>
                  {label}
                </Animated.Text>
              </Pressable>
            </Animated.View>
          );
        })}
      {/* Риска-указатель в центре, как на колесе таймера. */}
      <View pointerEvents="none" style={styles.notch} />
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: {
      height: 52,
      overflow: 'hidden',
    },
    item: {
      position: 'absolute',
      top: 0,
      width: ITEM_WIDTH,
      height: 44,
    },
    hit: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.4,
      // На вебе тап по подписи выделял её синим, как текст на странице.
      userSelect: 'none',
    },
    notch: {
      position: 'absolute',
      bottom: 0,
      alignSelf: 'center',
      width: 18,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
  }),
);
