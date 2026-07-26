import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Bot, Check, Infinity as InfinityIcon, ShoppingBasket, Users } from 'lucide-react-native';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../../components/ui/FadeInView';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE } from '../../i18n/translations';
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

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchSubscription(userId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

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
              {/* Кнопка намеренно неактивна: покупки подключатся, когда
                  приложение появится в App Store / Google Play — до этого
                  оформить подписку технически невозможно. */}
              <PrimaryButton label={t('subscription_cta_soon')} onPress={() => {}} disabled />
              <Text style={styles.notReady}>{t('subscription_not_ready')}</Text>
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
}));
