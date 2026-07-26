import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Clock,
  Infinity as InfinityIcon,
  ListChecks,
  Lock,
  RotateCcw,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hasLegalLinks, LEGAL_URLS } from '../../config/legal';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE, type TranslationKey } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { redeemPromoCode, type RedeemFailure } from '../../services/subscription/promoService';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { FREE_SCAN_LIMIT, scansLeft, useSubscriptionStore } from '../../store/subscriptionStore';
import { useToastStore } from '../../store/toastStore';
import { colors, getCurrentTheme } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'Subscription'>;

type PlanId = 'month' | 'year' | 'lifetime';

// Цены-заглушки: настоящие приходят из App Store / Google Play вместе с
// товарами подписки и уже локализованы магазином. До подключения покупок
// правятся здесь — единственное место, где они заданы.
const PLANS: { id: PlanId; titleKey: TranslationKey; price: string; perMonth?: string; best?: boolean }[] = [
  { id: 'month', titleKey: 'subscription_plan_month', price: '4,99 $' },
  { id: 'year', titleKey: 'subscription_plan_year', price: '29,99 $', perMonth: '2,49 $', best: true },
  { id: 'lifetime', titleKey: 'subscription_plan_lifetime', price: '79,99 $' },
];

// Две главные ценности показываются подробно, остальное — плотным списком.
// Одинаковая плотность по всему экрану как раз и читается как шаблон.
const HEADLINE_FEATURES: { Icon: typeof InfinityIcon; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { Icon: InfinityIcon, titleKey: 'subscription_feature_scans', descKey: 'subscription_feature_scans_desc' },
  { Icon: Sparkles, titleKey: 'subscription_feature_chat', descKey: 'subscription_feature_chat_desc' },
];

const COMPACT_FEATURES: { Icon: typeof Users; labelKey: TranslationKey }[] = [
  { Icon: Users, labelKey: 'subscription_feature_family_short' },
  { Icon: ListChecks, labelKey: 'subscription_feature_insights_short' },
  { Icon: Clock, labelKey: 'subscription_feature_history_short' },
  { Icon: ArrowDownToLine, labelKey: 'subscription_feature_export_short' },
  { Icon: Zap, labelKey: 'subscription_feature_priority_short' },
];

const FAILURE_KEY: Record<RedeemFailure, TranslationKey> = {
  not_found: 'subscription_promo_not_found',
  exhausted: 'subscription_promo_exhausted',
  already_used: 'subscription_promo_already_used',
  empty: 'subscription_promo_not_found',
  network: 'subscription_promo_network',
};

export function SubscriptionScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const isPro = useSubscriptionStore((state) => state.isPro);
  const expiresAt = useSubscriptionStore((state) => state.expiresAt);
  const scansUsed = useSubscriptionStore((state) => state.scansUsed);
  const fetchSubscription = useSubscriptionStore((state) => state.fetch);
  const showToast = useToastStore((state) => state.show);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('year');
  const [restoring, setRestoring] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchSubscription(userId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

  const left = scansLeft(isPro, scansUsed) ?? 0;
  // Полоса показывает ОСТАТОК и убывает по мере трат: рядом стоит число
  // оставшихся сканов, и заполнение израсходованным читалось бы наоборот.
  const leftRatio = Math.max(0, Math.min(1, left / FREE_SCAN_LIMIT));
  const runningOut = left > 0 && left <= 2;

  // Заполняется от нуля при появлении экрана: движение объясняет цифру
  // рядом лучше, чем статичный отрезок.
  const barProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isPro) return;
    const animation = Animated.timing(barProgress, {
      toValue: leftRatio,
      duration: 620,
      delay: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [barProgress, leftRatio, isPro]);

  const barWidth = barProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  async function handleRedeem() {
    if (!promoCode.trim() || !userId) return;
    setRedeeming(true);
    setPromoError(null);
    const result = await redeemPromoCode(promoCode.trim());
    setRedeeming(false);

    if (!result.ok) {
      haptics.warning();
      setPromoError(t(FAILURE_KEY[result.reason]));
      return;
    }

    haptics.success();
    showToast(t('subscription_promo_success'));
    setPromoOpen(false);
    setPromoCode('');
    // Состояние перечитываем с сервера, а не выставляем локально: источник
    // истины — база, и экран сразу покажет реальный срок действия.
    await fetchSubscription(userId);
  }

  // Apple требует кнопку восстановления покупок на экране подписки. Пока
  // магазинных покупок нет, восстанавливать нужно ровно то, что есть:
  // состояние подписки на сервере — оно переживает переустановку и смену
  // устройства. Когда появится StoreKit, сюда добавится и его restore.
  async function handleRestore() {
    if (!userId || restoring) return;
    setRestoring(true);
    await fetchSubscription(userId);
    setRestoring(false);
    const restored = useSubscriptionStore.getState().isPro;
    haptics.light();
    showToast(t(restored ? 'subscription_restore_found' : 'subscription_restore_none'));
  }

  function openLegal(url: string) {
    // Ссылки рисуются только когда адрес задан, поэтому отдельного текста
    // об ошибке нет: показывать пользователю нечего, а падать незачем.
    if (url) Linking.openURL(url).catch(() => {});
  }

  function handlePurchase() {
    // Покупок пока нет — товары подписки появятся вместе с публикацией.
    // Молча ничего не делать нельзя: пользователь решит, что кнопка сломана.
    haptics.light();
    showToast(t('subscription_payments_pending'));
    setPromoOpen(true);
  }

  const activePlan = PLANS.find((plan) => plan.id === selectedPlan) ?? PLANS[1];
  const intl = INTL_LOCALE[locale];

  function resetDateLabel() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString(intl, { day: 'numeric', month: 'long' });
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('subscription_title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Hero isPro={isPro} />

        {isPro ? (
          <View style={styles.statusCard}>
            <View style={styles.statusMark}>
              <Check color={colors.accent} size={15} strokeWidth={2.6} />
            </View>
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{t('subscription_active_title')}</Text>
              <Text style={styles.statusMeta}>
                {expiresAt
                  ? t('subscription_active_until', { date: new Date(expiresAt).toLocaleDateString(intl) })
                  : t('subscription_active_forever')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.quotaCard}>
            <View style={styles.quotaTop}>
              <Text style={styles.quotaLabel}>{t('subscription_quota_title')}</Text>
              <Text style={styles.quotaCount}>
                <Text style={left === 0 ? styles.quotaCountEmpty : styles.quotaCountValue}>{left}</Text>
                <Text style={styles.quotaCountTotal}> / {FREE_SCAN_LIMIT}</Text>
              </Text>
            </View>
            <View style={styles.barTrack}>
              <Animated.View style={[styles.barFill, { width: barWidth }, runningOut && styles.barFillLow]} />
            </View>
            <Text style={styles.quotaHint}>{t('subscription_quota_reset', { date: resetDateLabel() })}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>{t('subscription_section_included')}</Text>

        <View style={styles.headlineGroup}>
          {HEADLINE_FEATURES.map(({ Icon, titleKey, descKey }) => (
            <View key={titleKey} style={styles.headlineRow}>
              <View style={styles.headlineIcon}>
                <Icon color={colors.accent} size={17} strokeWidth={1.9} />
              </View>
              <View style={styles.headlineText}>
                <Text style={styles.headlineTitle}>{t(titleKey)}</Text>
                <Text style={styles.headlineDesc}>{t(descKey)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.compactGroup}>
          {COMPACT_FEATURES.map(({ Icon, labelKey }, index) => (
            <View
              key={labelKey}
              style={[styles.compactRow, index === COMPACT_FEATURES.length - 1 && styles.compactRowLast]}
            >
              <Icon color={styles.mossIcon.color} size={16} strokeWidth={1.8} />
              <Text style={styles.compactLabel}>{t(labelKey)}</Text>
              {isPro && <Check color={colors.accent} size={14} strokeWidth={2.4} />}
            </View>
          ))}
        </View>

        {!isPro && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              {t('subscription_section_plan')}
            </Text>

            <View style={styles.planGroup}>
              {PLANS.map((plan, index) => {
                const selected = plan.id === selectedPlan;
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => {
                      haptics.selection();
                      setSelectedPlan(plan.id);
                    }}
                    style={[
                      styles.planRow,
                      index === PLANS.length - 1 && styles.planRowLast,
                      selected && styles.planRowSelected,
                    ]}
                  >
                    <View style={[styles.radio, selected && styles.radioOn]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.planText}>
                      <View style={styles.planTitleRow}>
                        <Text style={styles.planTitle}>{t(plan.titleKey)}</Text>
                        {plan.best && <Text style={styles.planBest}>{t('subscription_best_value')}</Text>}
                      </View>
                      <Text style={styles.planNote}>
                        {plan.id === 'year'
                          ? t('subscription_plan_year_note', { price: plan.perMonth ?? '' })
                          : plan.id === 'month'
                            ? t('subscription_plan_month_note')
                            : t('subscription_plan_lifetime_note')}
                      </Text>
                    </View>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handlePurchase}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaLabel}>{t('subscription_cta_trial')}</Text>
            </Pressable>
            <Text style={styles.ctaNote}>{t('subscription_cta_note', { price: activePlan.price })}</Text>

            <View style={styles.trustRow}>
              <View style={styles.trustItem}>
                <RotateCcw color={styles.mossIcon.color} size={12} strokeWidth={1.8} />
                <Text style={styles.trustText}>{t('subscription_trust_cancel')}</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustItem}>
                <Lock color={styles.mossIcon.color} size={12} strokeWidth={1.8} />
                <Text style={styles.trustText}>{t('subscription_trust_secure')}</Text>
              </View>
            </View>

            {/* Обязательный блок для ревью магазинов: условия автопродления,
                восстановление покупок и рабочие ссылки на документы. */}
            <Text style={styles.autoRenew}>{t('subscription_autorenew')}</Text>

            <View style={styles.legalRow}>
              <Pressable onPress={handleRestore} hitSlop={8} disabled={restoring}>
                <Text style={[styles.legalLink, restoring && styles.legalLinkMuted]}>
                  {t('subscription_restore')}
                </Text>
              </Pressable>
              {hasLegalLinks() && (
                <>
                  <View style={styles.legalDot} />
                  <Pressable onPress={() => openLegal(LEGAL_URLS.terms)} hitSlop={8}>
                    <Text style={styles.legalLink}>{t('subscription_terms_link')}</Text>
                  </Pressable>
                  <View style={styles.legalDot} />
                  <Pressable onPress={() => openLegal(LEGAL_URLS.privacy)} hitSlop={8}>
                    <Text style={styles.legalLink}>{t('subscription_privacy_link')}</Text>
                  </Pressable>
                </>
              )}
            </View>

            {promoOpen ? (
              <View style={styles.promoBlock}>
                <TextField
                  label={t('subscription_promo_label')}
                  value={promoCode}
                  onChangeText={(value) => {
                    setPromoCode(value);
                    setPromoError(null);
                  }}
                  placeholder={t('subscription_promo_placeholder')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {promoError && <Text style={styles.promoError}>{promoError}</Text>}
                <PrimaryButton
                  label={t('subscription_promo_activate')}
                  onPress={handleRedeem}
                  loading={redeeming}
                  disabled={!promoCode.trim()}
                />
              </View>
            ) : (
              <Pressable onPress={() => setPromoOpen(true)} hitSlop={8} style={styles.promoLinkWrap}>
                <Text style={styles.promoLink}>{t('subscription_promo_open')}</Text>
                <ChevronRight color={styles.promoLink.color} size={14} strokeWidth={2} />
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Заголовочный блок: метка, плотный заголовок и одна строка пояснения.
// Иллюстрации нет намеренно — вес даёт композиция и левое выравнивание,
// а не картинка.
function Hero({ isPro }: { isPro: boolean }) {
  const t = useT();
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  return (
    <View style={styles.hero}>
      <Animated.View
        style={[
          styles.proMark,
          {
            opacity: appear,
            transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          },
        ]}
      >
        <Text style={styles.proMarkText}>{t('subscription_pro_badge')}</Text>
      </Animated.View>

      <Text style={styles.heroTitle}>{t('subscription_hero_title')}</Text>
      {!isPro && <Text style={styles.heroSub}>{t('subscription_hero_sub')}</Text>}

      {/* Линия обрывается, не доходя до правого края: ровная рамка по всем
          сторонам — первое, что выдаёт шаблон. */}
      <View style={styles.heroRule} />
    </View>
  );
}

const styles = themedStyles(() => {
  const dark = getCurrentTheme() === 'dark';

  // Локальная приглушённая гамма. Глобальную палитру не трогаем: здесь
  // зелёный работает акцентом, а не заливкой — поэтому основной тон
  // серо-зелёный, а насыщенный цвет остаётся только у мелких меток.
  const moss = dark ? '#7E9A8B' : '#5E7A6B';
  const deep = dark ? '#1E4735' : '#22694A';
  const deepPressed = dark ? '#17392A' : '#1C5A3E';
  const hairline = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.08)';
  const wash = dark ? 'rgba(63,166,110,0.06)' : 'rgba(46,134,89,0.05)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 48,
    },
    mossIcon: {
      color: moss,
    },

    hero: {
      paddingTop: 6,
      paddingBottom: 22,
    },
    proMark: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: wash,
      borderWidth: 1,
      borderColor: hairline,
    },
    proMarkText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 26,
      lineHeight: 31,
      fontWeight: '700',
      letterSpacing: -0.6,
      marginTop: 14,
      maxWidth: '88%',
    },
    heroSub: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      maxWidth: '92%',
    },
    heroRule: {
      height: 1,
      backgroundColor: hairline,
      marginTop: 22,
      marginRight: 72,
    },

    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: hairline,
    },
    statusMark: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: wash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusText: {
      flex: 1,
      gap: 2,
    },
    statusTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    statusMeta: {
      color: moss,
      fontSize: 12.5,
    },

    quotaCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingTop: 14,
      paddingBottom: 13,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderColor: hairline,
    },
    quotaTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    quotaLabel: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    quotaCount: {
      fontSize: 13,
    },
    quotaCountValue: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    quotaCountEmpty: {
      color: colors.warning,
      fontSize: 14,
      fontWeight: '700',
    },
    quotaCountTotal: {
      color: colors.textTertiary,
      fontSize: 13,
    },
    barTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      marginTop: 11,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
    barFillLow: {
      backgroundColor: colors.warning,
    },
    quotaHint: {
      color: colors.textTertiary,
      fontSize: 11.5,
      marginTop: 9,
    },

    sectionLabel: {
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginTop: 30,
      marginBottom: 12,
      marginLeft: 2,
    },
    sectionLabelSpaced: {
      marginTop: 34,
    },

    headlineGroup: {
      gap: 16,
      paddingHorizontal: 2,
    },
    headlineRow: {
      flexDirection: 'row',
      gap: 13,
    },
    headlineIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: wash,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    headlineText: {
      flex: 1,
      gap: 3,
    },
    headlineTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    headlineDesc: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    // Второстепенные возможности идут плотным списком: они дополняют
    // картину, но не должны спорить за внимание с двумя главными.
    compactGroup: {
      marginTop: 20,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: hairline,
    },
    compactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    compactRowLast: {
      borderBottomWidth: 0,
    },
    compactLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },

    planGroup: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: hairline,
      overflow: 'hidden',
    },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    planRowLast: {
      borderBottomWidth: 0,
    },
    planRowSelected: {
      backgroundColor: wash,
    },
    radio: {
      width: 19,
      height: 19,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: {
      borderColor: colors.accent,
    },
    radioDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.accent,
    },
    planText: {
      flex: 1,
      gap: 2,
    },
    planTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    planTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    // Не бейдж-таблетка, а обычная мелкая подпись: рекомендация не должна
    // кричать громче цены.
    planBest: {
      color: moss,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    planNote: {
      color: colors.textTertiary,
      fontSize: 12,
    },
    planPrice: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },

    cta: {
      marginTop: 20,
      height: 50,
      borderRadius: 14,
      backgroundColor: deep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaPressed: {
      backgroundColor: deepPressed,
    },
    ctaLabel: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    ctaNote: {
      color: colors.textTertiary,
      fontSize: 11.5,
      lineHeight: 16,
      textAlign: 'center',
      marginTop: 10,
      paddingHorizontal: 12,
    },

    // Перенос нужен для узких экранов и укрупнённого системного шрифта:
    // без него строка обрезается по краю.
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 16,
    },
    trustItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    trustText: {
      color: colors.textTertiary,
      fontSize: 11,
    },
    trustDivider: {
      width: 1,
      height: 10,
      backgroundColor: hairline,
    },

    autoRenew: {
      color: colors.textTertiary,
      fontSize: 10.5,
      lineHeight: 15,
      textAlign: 'center',
      marginTop: 18,
      paddingHorizontal: 4,
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    legalLink: {
      color: moss,
      fontSize: 11.5,
      fontWeight: '500',
    },
    legalLinkMuted: {
      opacity: 0.5,
    },
    legalDot: {
      width: 2,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.textTertiary,
    },

    promoLinkWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      marginTop: 26,
      paddingVertical: 6,
    },
    promoLink: {
      color: moss,
      fontSize: 13,
      fontWeight: '600',
    },
    promoBlock: {
      marginTop: 26,
      gap: 10,
    },
    promoError: {
      color: colors.error,
      fontSize: 12.5,
    },
  });
});
