import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { colors } from '../../theme/colors';

const ACTION_WIDTH = 76;
// Свайп короче этого порога — просто закрывается назад, не считается
// намеренным действием (защита от случайных лёгких касаний при скролле).
const OPEN_DRAG_THRESHOLD = -40;

type Props = {
  children: ReactNode;
  onDelete: () => void | Promise<void>;
  confirmTitle?: string;
  confirmMessage?: string;
  style?: object;
};

// Свайп влево открывает корзинку (как в Телеграме): чтобы удалить нужно
// осознанно потянуть карточку и затем нажать на неё — случайный свайп во
// время скролла списка (`failOffsetY`) или лёгкое смещение (`activeOffsetX`)
// ничего не удаляют, а на самой корзинке ещё и стоит подтверждение.
export function SwipeToDeleteRow({ children, onDelete, confirmTitle, confirmMessage, style }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const measuredHeight = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onGestureEvent = Animated.event<PanGestureHandlerGestureEvent>(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true },
  );

  function onHandlerStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    const dx = event.nativeEvent.translationX;
    const shouldOpen = dx < OPEN_DRAG_THRESHOLD;
    if (shouldOpen && !open) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(translateX, {
      toValue: shouldOpen ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
    setOpen(shouldOpen);
  }

  function close() {
    setOpen(false);
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  }

  function confirmDelete() {
    Alert.alert(confirmTitle ?? 'Удалить чек?', confirmMessage ?? 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel', onPress: close },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          if (measuredHeight.current != null) heightAnim.setValue(measuredHeight.current);
          setRemoving(true);
          Animated.parallel([
            Animated.timing(translateX, { toValue: -400, duration: 240, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
            Animated.timing(heightAnim, { toValue: 0, duration: 240, useNativeDriver: false, delay: 60 }),
          ]).start(() => onDelete());
        },
      },
    ]);
  }

  const clampedTranslateX = translateX.interpolate({
    inputRange: [-ACTION_WIDTH, 0, 1],
    outputRange: [-ACTION_WIDTH, 0, 0],
    extrapolate: 'clamp',
  });
  const actionOpacity = translateX.interpolate({
    inputRange: [-ACTION_WIDTH, -12, 0],
    outputRange: [1, 0.2, 0],
    extrapolate: 'clamp',
  });
  const actionScale = translateX.interpolate({
    inputRange: [-ACTION_WIDTH, -20, 0],
    outputRange: [1, 0.7, 0.7],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        removing ? { height: heightAnim, opacity: opacityAnim, overflow: 'hidden' } : undefined,
      ]}
      onLayout={(e) => {
        if (!removing) measuredHeight.current = e.nativeEvent.layout.height;
      }}
    >
      <View style={[styles.wrapper, style]}>
        <View style={styles.actionsBackdrop}>
          <Animated.View style={{ opacity: actionOpacity, transform: [{ scale: actionScale }] }}>
            <Pressable style={styles.deleteButton} onPress={confirmDelete} hitSlop={8}>
              <Trash2 color="#fff" size={22} />
            </Pressable>
          </Animated.View>
        </View>
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={[-14, 1000]}
          failOffsetY={[-8, 8]}
        >
          <Animated.View style={{ transform: [{ translateX: clampedTranslateX }] }}>
            {children}
            {open && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  actionsBackdrop: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    borderRadius: 16,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
