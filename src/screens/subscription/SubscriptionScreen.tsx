import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Bot, Check, Infinity as InfinityIcon, ShoppingBasket, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../../components/ui/FadeInView';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE, type TranslationKey } from '../../i18n/translations';
import { redeemPromoCode, type RedeemFailure } from '../../services/subscription/promoService';
import { useToastStore } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import type { AppStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { FREE_SCAN_LIMIT, scansLeft, useSubscriptionStore } from '../../store/subscriptionStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AppStackParamList, 'Subscription'>;

export function SubscriptionScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const isPro = useSubscriptionStore((state) => state.isPro);
  const expiresAt = useSubscriptionStore((state) => state.expiresAt);
  const scansUsed = useSubscriptionStore((state) => state.scansUsed);
  const fetchSubscription = useSubscriptionStore((state) => state.fetch);
  const showToast = useToastStore((state) => state.show);

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

  const FAILURE_KEY: Record<RedeemFailure, TranslationKey> = {
    not_found: 'subscription_promo_not_found',
    exhausted: 'subscription_promo_exhausted',
    already_used: 'subscription_promo_already_used',
    empty: 'subscription_promo_not_found',
    network: 'subscription_promo_network',
  };

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
    // Перечитываем состояние с сервера, а не выставляем isPro локально:
    // источник истины — база, и экран сразу покажет реальный срок действия.
    await fetchSubscription(userId);
  }

  const left = scansLeft(isPro, scansUsed);

  const features = [
    { Icon: InfinityIcon, text: t('subscription_feature_scans') },
    { Icon: Bot, text: t('subscription_feature_chat') },
    { Icon: Users, text: t('subscription_feature_family') },
    { Icon: ShoppingBasket, text: t('subscription_feature_insights') },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('subscription_title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView index={0}>
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[`${colors.accent}3D`, `${colors.accent}00`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.badge}>
              <BadgeCheck color={colors.accent} size={16} />
              <Text style={styles.badgeText}>{t('subscription_pro_badge')}</Text>
            </View>
            <Text style={styles.heroTitle}>
              {isPro ? t('subscription_active_title') : t('subscription_title')}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isPro
                ? expiresAt
                  ? t('subscription_active_until', {
                      date: new Date(expiresAt).toLocaleDateString(INTL_LOCALE[locale]),
                    })
                  : t('subscription_active_forever')
                : t('subscription_tagline')}
            </Text>
          </View>
        </FadeInView>

        {!isPro && (
          <FadeInView index={1}>
            <View style={styles.quotaCard}>
              <Text style={styles.quotaText}>
                {left === 0
                  ? t('subscription_scans_none')
                  : t('subscription_scans_left', { left: String(left), limit: String(FREE_SCAN_LIMIT) })}
              </Text>
              <View style={styles.quotaBarTrack}>
                <View
                  style={[
                    styles.quotaBarFill,
                    { width: `${Math.min(100, (scansUsed / FREE_SCAN_LIMIT) * 100)}%` },
                    left === 0 && styles.quotaBarFillEmpty,
                  ]}
                />
              </View>
            </View>
          </FadeInView>
        )}

        <FadeInView index={2}>
          <View style={styles.featureCard}>
            {features.map(({ Icon, text }) => (
              <View key={text} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon color={colors.accent} size={18} strokeWidth={2} />
                </View>
                <Text style={styles.featureText}>{text}</Text>
                {isPro && <Check color={colors.success} size={16} />}
              </View>
            ))}
          </View>
        </FadeInView>

        {!isPro && (
          <FadeInView index={3}>
            <View style={styles.ctaBlock}>
              {/* Покупка через магазин недоступна, пока приложение не
                  опубликовано. До этого Pro выдаётся промокодом — его
                  проверяет сервер, поэтому «просто нажать и получить Pro»
                  нельзя. */}
              <PrimaryButton label={t('subscription_cta_soon')} onPress={() => {}} disabled />
              <Text style={styles.notReady}>{t('subscription_not_ready')}</Text>

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
                <Pressable onPress={() => setPromoOpen(true)} hitSlop={6} style={styles.promoLinkWrap}>
                  <Text style={styles.promoLink}>{t('subscription_promo_open')}</Text>
                </Pressable>
              )}
            </View>
          </FadeInView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  quotaCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  quotaText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  quotaBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  quotaBarFillEmpty: {
    backgroundColor: colors.warning,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  ctaBlock: {
    gap: 10,
    marginTop: 4,
  },
  notReady: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  promoLinkWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  promoLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  promoBlock: {
    gap: 10,
    marginTop: 6,
  },
  promoError: {
    color: colors.error,
    fontSize: 13,
  },
}));
