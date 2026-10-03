import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

// Переключатель с одной плашкой, которая перетекает к выбранному пункту.
// Подписи видны всегда: раньше виды карточки прятались за иконками в углах,
// и что откроется по тапу, приходилось угадывать.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(options.findIndex((o) => o.value === value), 0);
  const position = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: index,
      duration: 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [index, position]);

  const segmentWidth = width > 0 ? (width - PADDING * 2) / options.length : 0;

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: segmentWidth,
              transform: [{ translateX: Animated.multiply(position, segmentWidth) }],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            onPress={() => {
              if (active) return;
              haptics.selection();
              onChange(option.value);
            }}
            hitSlop={4}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PADDING = 3;

const styles = themedStyles(() =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: PADDING,
    },
    pill: {
      position: 'absolute',
      top: PADDING,
      bottom: PADDING,
      left: PADDING,
      borderRadius: 9,
      backgroundColor: colors.accent,
    },
    segment: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '500',
    },
    labelActive: {
      color: colors.background,
      fontWeight: '600',
    },
  }),
);
