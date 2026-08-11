import { Check, ScanLine, ShieldAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { translate } from '../../i18n/translate';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 220;

// Общий бесконечный «плеер» — t бежит 0→1 за duration и сразу зацикливается.
// Все 4 иллюстрации строят свои тайминги через interpolate от одного t,
// а не россыпью независимых Animated.timing — так легче держать сцену в синхроне.
// Крутится с монтирования компонента независимо от того, видим ли слайд —
// список всего из 4 лёгких иллюстраций, лишний JS-таймер не заметен, а
// привязка к «активному» слайду через page-state на web ловила гонку и
// анимация иногда просто не стартовала.
function useLoopedClock(duration: number) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    function run() {
      t.setValue(0);
      Animated.timing(t, { toValue: 1, duration, useNativeDriver: false }).start(({ finished }) => {
        if (finished && !cancelled) run();
      });
    }
    run();
    return () => {
      cancelled = true;
      t.stopAnimation();
    };
  }, [duration, t]);
  return t;
}

// ── 1. Скан чека: чек «вплывает» в рамку камеры, вспышка, галочка. ──────────
export function ScanIllustration({ active }: { active: boolean }) {
  const t = useLoopedClock(3400);

  const receiptY = t.interpolate({
    inputRange: [0, 0.32, 1],
    outputRange: [46, 0, 0],
    extrapolate: 'clamp',
  });
  const receiptOpacity = t.interpolate({
    inputRange: [0, 0.25, 0.85, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const bracketOpacity = t.interpolate({
    inputRange: [0, 0.1, 0.3, 0.42],
    outputRange: [0.35, 0.9, 0.9, 0.35],
    extrapolate: 'clamp',
  });
  const flashScale = t.interpolate({
    inputRange: [0.32, 0.44],
    outputRange: [0.3, 2.1],
    extrapolate: 'clamp',
  });
  const flashOpacity = t.interpolate({
    inputRange: [0.32, 0.38, 0.48],
    outputRange: [0, 0.75, 0],
    extrapolate: 'clamp',
  });
  const checkScale = t.interpolate({
    inputRange: [0.4, 0.5, 0.56, 0.86, 1],
    outputRange: [0, 1.25, 1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.box}>
      <View style={styles.scanFrame}>
        {/* уголки прицела */}
        <Animated.View style={[styles.corner, styles.cornerTL, { opacity: bracketOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerTR, { opacity: bracketOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerBL, { opacity: bracketOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerBR, { opacity: bracketOpacity }]} />

        <Animated.View
          style={[styles.receipt, { opacity: receiptOpacity, transform: [{ translateY: receiptY }] }]}
        >
          <View style={[styles.receiptLine, { width: '70%' }]} />
          <View style={[styles.receiptLine, { width: '90%' }]} />
          <View style={[styles.receiptLine, { width: '55%' }]} />
          <View style={[styles.receiptLine, styles.receiptTotal, { width: '65%' }]} />
        </Animated.View>

        <Animated.View style={[styles.flash, { opacity: flashOpacity, transform: [{ scale: flashScale }] }]} />

        <View style={styles.scanIconWrap}>
          <ScanLine color={colors.textTertiary} size={20} strokeWidth={1.5} />
        </View>

        <Animated.View style={[styles.checkBadge, { transform: [{ scale: checkScale }] }]}>
          <Check color={colors.background} size={20} strokeWidth={3} />
        </Animated.View>
      </View>
    </View>
  );
}

// ── 2. Диаграмма: кольцо крутится, число наматывается, «монетки» летят
//    от центра к сегментам категорий. ───────────────────────────────────────
const CHART_SEGMENTS = [
  { color: '#7FAE86', from: 0, to: 150 },
  { color: '#CB8571', from: 150, to: 250 },
  { color: '#7B93B5', from: 250, to: 360 },
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function Coin({ t, delay, angle, tint }: { t: Animated.Value; delay: number; angle: number; tint: string }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const dest = polar(cx, cy, 62, angle);
  const local = t.interpolate({
    inputRange: [delay, Math.min(delay + 0.32, 1)],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const x = local.interpolate({ inputRange: [0, 1], outputRange: [cx, dest.x] });
  const y = local.interpolate({ inputRange: [0, 1], outputRange: [cy, dest.y] });
  const r = local.interpolate({ inputRange: [0, 1], outputRange: [5, 2] });
  const opacity = t.interpolate({
    inputRange: [delay, Math.min(delay + 0.06, 1), Math.min(delay + 0.26, 1), Math.min(delay + 0.34, 1)],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  return (
    <AnimatedCircle
      cx={x as unknown as number}
      cy={y as unknown as number}
      r={r as unknown as number}
      fill={tint}
      opacity={opacity}
    />
  );
}

export function ChartIllustration({ active }: { active: boolean }) {
  const t = useLoopedClock(3600);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const countUp = t.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 3284, 3284],
    extrapolate: 'clamp',
  });
  const display = useAnimatedNumber(countUp);

  return (
    <View style={styles.box}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={SIZE} height={SIZE}>
          {CHART_SEGMENTS.map((seg, i) => {
            const frac = (seg.to - seg.from) / 360;
            const dash = frac * circumference;
            const startAngle = seg.from;
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={seg.color}
                strokeWidth={20}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeLinecap="round"
                originX={cx}
                originY={cy}
                rotation={startAngle}
              />
            );
          })}
        </Svg>
      </Animated.View>
      <View style={styles.chartCenter} pointerEvents="none">
        <Text style={styles.chartNumber}>{display}</Text>
        <Text style={styles.chartSub}>CZK</Text>
      </View>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Coin t={t} delay={0.05} angle={60} tint={CHART_SEGMENTS[0].color} />
        <Coin t={t} delay={0.18} angle={210} tint={CHART_SEGMENTS[1].color} />
        <Coin t={t} delay={0.32} angle={310} tint={CHART_SEGMENTS[2].color} />
        <Coin t={t} delay={0.5} angle={90} tint={CHART_SEGMENTS[0].color} />
      </Svg>
    </View>
  );
}

// Число-«счётчик»: подписывается на Animated.Value через listener и
// хранит только текст в state, не гоняя все стили иллюстрации через JS-мост.
function useAnimatedNumber(value: Animated.AnimatedInterpolation<number>): string {
  const [text, setText] = useState('0');
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setText(Math.round(v).toString()));
    return () => value.removeListener(id);
  }, [value]);
  return text;
}

// ── 3. Лимиты: кольцо-прогресс наливается к порогу, цвет меняется,
//    иконка предупреждения «встряхивается». ────────────────────────────────
export function LimitsIllustration({ active }: { active: boolean }) {
  const t = useLoopedClock(3200);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Незалитая часть кольца: 0% → offset = circumference (ничего не видно),
  // 92% → offset = circumference*0.08 (кольцо почти замкнуто).
  const strokeDashoffset = t.interpolate({
    inputRange: [0, 0.6, 0.85, 1],
    outputRange: [circumference, circumference * 0.08, circumference * 0.08, circumference],
    extrapolate: 'clamp',
  });
  const ringColor = t.interpolate({
    inputRange: [0, 0.35, 0.55, 0.6],
    outputRange: [colors.accent, colors.accent, colors.warning, colors.error],
    extrapolate: 'clamp',
  });
  const percentValue = t.interpolate({
    inputRange: [0, 0.6, 0.85, 1],
    outputRange: [0, 92, 92, 0],
    extrapolate: 'clamp',
  });
  const percentText = useAnimatedNumber(percentValue);
  const shake = t.interpolate({
    inputRange: [0.58, 0.6, 0.62, 0.64, 0.66, 1],
    outputRange: [0, -8, 8, -6, 0, 0],
    extrapolate: 'clamp',
  });
  const percentColor = t.interpolate({
    inputRange: [0, 0.55, 0.6],
    outputRange: [colors.textPrimary, colors.textPrimary, colors.error],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.box}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={cx} cy={cy} r={radius} stroke={colors.surfaceElevated} strokeWidth={16} fill="none" />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={ringColor as unknown as string}
          strokeWidth={16}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          originX={cx}
          originY={cy}
          rotation={-90}
        />
      </Svg>
      <View style={styles.chartCenter} pointerEvents="none">
        <Animated.Text style={[styles.chartNumber, { color: percentColor as unknown as string }]}>
          {percentText}%
        </Animated.Text>
        <Text style={styles.chartSub}>{translate('intro_limit_example')}</Text>
      </View>
      <Animated.View style={[styles.warnBadge, { transform: [{ rotate: shake.interpolate({ inputRange: [-8, 8], outputRange: ['-14deg', '14deg'] }) }] }]}>
        <ShieldAlert color={colors.background} size={16} strokeWidth={2.25} />
      </Animated.View>
    </View>
  );
}

// ── 4. Семья: два телефона с аватарками, между ними бегают точки синка. ────
export function FamilyIllustration({ active }: { active: boolean }) {
  const t = useLoopedClock(2600);

  const dot1X = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  const dot1Opacity = t.interpolate({
    inputRange: [0, 0.08, 0.42, 0.5],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const dot2X = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const dot2Opacity = t.interpolate({
    inputRange: [0.5, 0.58, 0.92, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const linkPulse = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });

  return (
    <View style={styles.box}>
      <View style={styles.familyRow}>
        <View style={[styles.phone, { borderColor: colors.accent }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>
          <View style={styles.phoneLine} />
        </View>

        <View style={styles.linkTrack}>
          <Animated.View style={[styles.linkPulse, { transform: [{ scale: linkPulse }] }]} />
          <Animated.View
            style={[
              styles.syncDot,
              {
                opacity: dot1Opacity,
                transform: [{ translateX: dot1X.interpolate({ inputRange: [0, 1], outputRange: [-26, 26] }) }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.syncDot,
              styles.syncDotAlt,
              {
                opacity: dot2Opacity,
                transform: [{ translateX: dot2X.interpolate({ inputRange: [0, 1], outputRange: [26, -26] }) }],
              },
            ]}
          />
        </View>

        <View style={[styles.phone, { borderColor: colors.warning }]}>
          <View style={[styles.avatar, { backgroundColor: colors.warning }]}>
            <Text style={styles.avatarLetter}>M</Text>
          </View>
          <View style={styles.phoneLine} />
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Скан
  scanFrame: {
    width: 150,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: colors.accent,
  },
  cornerTL: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 },
  receipt: {
    width: 96,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    gap: 7,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  receiptLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
  },
  receiptTotal: {
    backgroundColor: colors.accent,
    marginTop: 3,
  },
  flash: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFFFF',
  },
  scanIconWrap: {
    position: 'absolute',
    bottom: -6,
    left: -6,
    opacity: 0.5,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Диаграмма / лимиты
  chartCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  chartNumber: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  chartSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  warnBadge: {
    position: 'absolute',
    top: 22,
    right: 30,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Семья
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phone: {
    width: 66,
    height: 118,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
  phoneLine: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
  },
  linkTrack: {
    width: 56,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkPulse: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textTertiary,
    opacity: 0.4,
  },
  syncDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
  },
  syncDotAlt: {
    backgroundColor: colors.warning,
  },
}));
