import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

// Горизонтальный «барабан»: подписи стоят на невидимом цилиндре. Крутишь
// пальцем — они прокатываются, выбранная крупно в центре, соседние
// уменьшаются, поворачиваются и тают к краям. На каждом перещелчке —
// короткий тактильный щелчок, как у механического календаря.
const ITEM_WIDTH = 132;
const NATIVE_DRIVER = Platform.OS !== 'web';

export function WheelSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const index = Math.max(options.findIndex((o) => o.value === value), 0);
  const lastTick = useRef(index);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);

  // Значение могло смениться снаружи (свайп по карточке) — докручиваем.
  useEffect(() => {
    if (width === 0 || dragging.current) return;
    scrollRef.current?.scrollTo({ x: index * ITEM_WIDTH, animated: true });
    lastTick.current = index;
  }, [index, width]);

  function nearestIndex(x: number) {
    return Math.min(Math.max(Math.round(x / ITEM_WIDTH), 0), options.length - 1);
  }

  function settle(x: number) {
    const next = nearestIndex(x);
    // На вебе нет инерционной доводки до позиции — ставим точно сами.
    if (Math.abs(x - next * ITEM_WIDTH) > 1) {
      scrollRef.current?.scrollTo({ x: next * ITEM_WIDTH, animated: true });
    }
    if (options[next].value !== value) onChange(options[next].value);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    const current = nearestIndex(x);
    if (current !== lastTick.current) {
      lastTick.current = current;
      haptics.selection();
    }
    // Веб не присылает onMomentumScrollEnd надёжно: считаем, что барабан
    // остановился, если прокрутки не было 120 мс.
    if (Platform.OS === 'web') {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => settle(x), 120);
    }
  }

  const sidePadding = Math.max((width - ITEM_WIDTH) / 2, 0);

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: sidePadding }}
          contentOffset={{ x: index * ITEM_WIDTH, y: 0 }}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            dragging.current = true;
          }}
          onMomentumScrollEnd={(e) => {
            dragging.current = false;
            settle(e.nativeEvent.contentOffset.x);
          }}
          onScrollEndDrag={(e) => {
            // Отпустили без инерции — доводим сразу.
            const velocity = e.nativeEvent.velocity?.x ?? 0;
            if (Math.abs(velocity) < 0.05) {
              dragging.current = false;
              settle(e.nativeEvent.contentOffset.x);
            }
          }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: NATIVE_DRIVER,
            listener: handleScroll,
          })}
        >
          {options.map((option, i) => {
            const inputRange = [
              (i - 2) * ITEM_WIDTH,
              (i - 1) * ITEM_WIDTH,
              i * ITEM_WIDTH,
              (i + 1) * ITEM_WIDTH,
              (i + 2) * ITEM_WIDTH,
            ];
            const rotateY = scrollX.interpolate({
              inputRange,
              outputRange: ['62deg', '42deg', '0deg', '-42deg', '-62deg'],
              extrapolate: 'clamp',
            });
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.62, 0.78, 1, 0.78, 0.62],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.12, 0.35, 1, 0.35, 0.12],
              extrapolate: 'clamp',
            });
            return (
              <Pressable
                key={option.value}
                style={styles.item}
                onPress={() => scrollRef.current?.scrollTo({ x: i * ITEM_WIDTH, animated: true })}
              >
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    { opacity, transform: [{ perspective: 600 }, { rotateY }, { scale }] },
                  ]}
                >
                  {option.label}
                </Animated.Text>
              </Pressable>
            );
          })}
        </Animated.ScrollView>
      )}
      {/* Метка центра: маленькая риска, как указатель на барабане. */}
      <View pointerEvents="none" style={styles.notch} />
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: {
      height: 52,
      justifyContent: 'center',
    },
    item: {
      width: ITEM_WIDTH,
      height: 44,
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
