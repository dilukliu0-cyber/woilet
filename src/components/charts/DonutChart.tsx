import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { AnimatedNumber } from '../ui/AnimatedNumber';

export type DonutSegment = {
  value: number;
  color: string;
  key: string;
};

type Props = {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerTop?: string;
  // Если задано — центр «наматывается» до значения вместо статичного текста
  // (centerTop в этом случае игнорируется).
  centerValue?: number;
  centerFormatter?: (n: number) => string;
  centerBottom?: string;
  onSegmentPress?: (key: string) => void;
};

// Кольцевая диаграмма на SVG. Тап по кольцу — плавный поворот на 360°
// (пожелание: «нажал на диаграмму — она прокрутилась»). При появлении —
// лёгкое масштабирование.
export function DonutChart({
  segments,
  size = 200,
  strokeWidth = 26,
  centerTop,
  centerValue,
  centerFormatter,
  centerBottom,
  onSegmentPress,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const turns = useRef(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  function handleSpin() {
    turns.current += 1;
    Animated.timing(spin, {
      toValue: turns.current,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  let cumulative = 0;

  return (
    <Pressable onPress={handleSpin}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          {/* Дорожка кольца рисуется всегда: без неё месяц без трат выглядел
              как пустое место, будто экран не загрузился. */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.surfaceElevated}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {segments.map((segment) => {
            const fraction = segment.value / total;
            const startAngle = -90 + cumulative * 360;
            const dash = fraction * circumference;
            cumulative += fraction;
            return (
              <Circle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={segment.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeLinecap="butt"
                originX={size / 2}
                originY={size / 2}
                rotation={startAngle}
                onPress={onSegmentPress ? () => onSegmentPress(segment.key) : undefined}
              />
            );
          })}
        </Svg>
      </Animated.View>

      <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
        {centerValue !== undefined ? (
          <AnimatedNumber value={centerValue} formatter={centerFormatter} style={styles.centerTop} />
        ) : (
          centerTop && <Text style={styles.centerTop}>{centerTop}</Text>
        )}
        {centerBottom && <Text style={styles.centerBottom}>{centerBottom}</Text>}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTop: {
    color: colors.textPrimary,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  centerBottom: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
}));
