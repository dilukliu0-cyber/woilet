import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, BadgeCheck, Camera, ChevronRight, LogOut, Pencil } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SelectableRow } from '../../components/ui/SelectableRow';
import { TextField } from '../../components/ui/TextField';
import type { AppStackParamList } from '../../navigation/types';
import { supabase } from '../../services/api/supabaseClient';
import { avatarUrl, pickAndUploadAvatar } from '../../services/profile/avatarService';
import { sendTestNotification } from '../../services/notifications/pushNotifications';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE, LOCALES } from '../../i18n/translations';
import { useLocaleStore } from '../../store/localeStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { FREE_SCAN_LIMIT, scansLeft, useSubscriptionStore } from '../../store/subscriptionStore';
import { useToastStore } from '../../store/toastStore';
import { CURRENCIES, currencyName } from '../../utils/currencies';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Один экран вместо двух: раньше «Профиль» (ник/аватарка/ID) и «Настройки»
// (тема/язык/валюта/...) жили отдельно — теперь всё здесь, попадают сюда
// через единственный пункт «Настройка профиля» в рулетке аватарки.
export function ProfileScreen() {
  const t = useT();
  const intlLocale = INTL_LOCALE[useLocaleStore((state) => state.locale)];
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const showToast = useToastStore((state) => state.show);
  const isPro = useSubscriptionStore((state) => state.isPro);
  const scansUsed = useSubscriptionStore((state) => state.scansUsed);
  const proScansLeft = scansLeft(isPro, scansUsed) ?? 0;

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [currencyOpen, setCurrencyOpen] = useState(false);

  // Профиль лежит в корневом стеке (не во вкладках), поэтому родителя может
  // не быть — тогда навигируем через собственный navigation.
  const rootNavigation = () => navigation.getParent<NativeStackNavigationProp<AppStackParamList>>() ?? navigation;
  const userId = session?.user.id ?? '';
  const nickname = settings?.nickname?.trim() || t('profile_no_name');
  const avatar = avatarUrl(settings?.avatar_path ?? null, settings?.updated_at);

  const visibleCurrencies = useMemo(() => {
    const q = currencyQuery.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        currencyName(c.code, intlLocale).toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase() === q,
    );
  }, [currencyQuery, intlLocale]);

  async function handlePickAvatar() {
    if (!userId || uploadingAvatar) return;
    setUploadingAvatar(true);
    const { path, error } = await pickAndUploadAvatar(userId);
    if (path) {
      await updateSettings({ avatar_path: path });
      showToast(t('profile_avatar_updated'));
    } else if (error) {
      Alert.alert(t('profile_avatar_upload_failed'), error);
    }
    setUploadingAvatar(false);
  }

  function openNicknameEditor() {
    setNicknameDraft(settings?.nickname ?? '');
    setEditingNickname(true);
  }

  async function saveNickname() {
    const trimmed = nicknameDraft.trim();
    if (!trimmed) {
      Alert.alert(t('profile_nickname_empty'));
      return;
    }
    await updateSettings({ nickname: trimmed });
    setEditingNickname(false);
  }

  async function copyId() {
    if (!userId) return;
    await Clipboard.setStringAsync(userId);
    showToast(t('profile_id_copied'));
  }

  async function handleDeleteAccount() {
    Alert.alert(
      t('profile_delete_account_confirm_title'),
      t('profile_delete_account_confirm_body'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_delete_all'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
              'delete-account',
            );
            setDeleting(false);
            if (error || !data?.ok) {
              Alert.alert(
                t('profile_delete_account_failed'),
                error?.message ?? data?.error ?? t('profile_delete_account_retry'),
              );
              return;
            }
            await signOut();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('profile_title')}</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.avatarWrap} onPress={handlePickAvatar} disabled={uploadingAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{nickname[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Camera color={colors.background} size={13} />
            </View>
          </Pressable>
          <Pressable style={styles.nicknameRow} onPress={openNicknameEditor}>
            <Text style={styles.nickname}>{nickname}</Text>
            <Pencil color={colors.textTertiary} size={14} />
          </Pressable>
        </View>

        {/* Категории и Семейный аккаунт уже доступны из рулетки аватарки —
            здесь дублировать их не нужно, остаётся только ID. */}
        <Pressable style={styles.idRow} onPress={copyId}>
          <Text style={styles.idLabel}>{t('profile_id_label')}</Text>
          <Text style={styles.idValue}>{userId}</Text>
        </Pressable>

        {/* Подписка: на бесплатном тарифе показываем остаток сканов, на Pro —
            статус. Единственная точка входа в экран подписки. */}
        <Pressable style={styles.proRow} onPress={() => rootNavigation()?.navigate('Subscription')}>
          <View style={styles.proIcon}>
            <BadgeCheck color={colors.accent} size={20} />
          </View>
          <View style={styles.proInfo}>
            <Text style={styles.proTitle}>{t('subscription_title')}</Text>
            <Text style={styles.proSubtitle}>
              {isPro
                ? t('subscription_active_title')
                : proScansLeft === 0
                  ? t('subscription_scans_none')
                  : t('subscription_scans_left', {
                      left: String(proScansLeft),
                      limit: String(FREE_SCAN_LIMIT),
                    })}
            </Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={18} />
        </Pressable>

        {/* Оформление: тема + язык интерфейса. */}
        <View style={styles.groupCard}>
          <Text style={styles.groupTitle}>{t('profile_appearance')}</Text>
          <Text style={styles.subLabel}>{t('profile_theme')}</Text>
          <View style={styles.list}>
            <SelectableRow
              label={t('profile_theme_dark')}
              selected={(settings?.theme ?? 'dark') === 'dark'}
              onPress={() => updateSettings({ theme: 'dark' })}
            />
            <SelectableRow
              label={t('profile_theme_light')}
              selected={settings?.theme === 'light'}
              onPress={() => updateSettings({ theme: 'light' })}
            />
          </View>
          <Text style={styles.subLabel}>{t('profile_language')}</Text>
          <View style={styles.list}>
            {LOCALES.map((lang) => (
              <SelectableRow
                key={lang.code}
                label={lang.label}
                selected={settings?.language === lang.code}
                onPress={() => updateSettings({ language: lang.code })}
              />
            ))}
          </View>
        </View>

        {/* Деньги: валюта + перевод названий товаров — всё, что касается чеков. */}
        <View style={styles.groupCard}>
          <Text style={styles.groupTitle}>{t('profile_money_items')}</Text>
          <Text style={styles.subLabel}>{t('profile_main_currency')}</Text>
          {!currencyOpen ? (
            <Pressable style={styles.currencyRow} onPress={() => setCurrencyOpen(true)}>
              <Text style={styles.currencyValue}>
                {(() => {
                  const cur = CURRENCIES.find((c) => c.code === (settings?.currency ?? 'CZK'));
                  return cur ? `${currencyName(cur.code, intlLocale)} (${cur.symbol}) · ${cur.code}` : settings?.currency ?? 'CZK';
                })()}
              </Text>
              <Text style={styles.currencyChange}>{t('profile_change')}</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                style={styles.searchInput}
                value={currencyQuery}
                onChangeText={setCurrencyQuery}
                placeholder={t('profile_currency_search_placeholder')}
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              <View style={styles.list}>
                {visibleCurrencies.map((currency) => (
                  <SelectableRow
                    key={currency.code}
                    label={`${currencyName(currency.code, intlLocale)} (${currency.symbol}) · ${currency.code}`}
                    selected={settings?.currency === currency.code}
                    onPress={() => {
                      updateSettings({ currency: currency.code });
                      setCurrencyOpen(false);
                      setCurrencyQuery('');
                    }}
                  />
                ))}
                {visibleCurrencies.length === 0 && <Text style={styles.hint}>{t('profile_nothing_found')}</Text>}
              </View>
            </>
          )}
          <Text style={styles.hint}>{t('profile_currency_hint')}</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>{t('profile_translate_items')}</Text>
              <Text style={styles.toggleHint}>{t('profile_translate_items_hint')}</Text>
            </View>
            <Switch
              value={settings?.translate_items ?? false}
              onValueChange={(value) => updateSettings({ translate_items: value })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Диаграммы: вид на обоих экранах вместе. */}
        <View style={styles.groupCard}>
          <Text style={styles.groupTitle}>{t('profile_charts')}</Text>
          <Text style={styles.subLabel}>{t('profile_charts_expenses')}</Text>
          <View style={styles.list}>
            <SelectableRow
              label={t('profile_chart_donut')}
              selected={(settings?.chart_style ?? 'donut') === 'donut'}
              onPress={() => updateSettings({ chart_style: 'donut' })}
            />
            <SelectableRow
              label={t('profile_chart_bars')}
              selected={settings?.chart_style === 'bars'}
              onPress={() => updateSettings({ chart_style: 'bars' })}
            />
          </View>
          <Text style={styles.subLabel}>{t('profile_charts_home')}</Text>
          <View style={styles.list}>
            <SelectableRow
              label={t('profile_chart_line')}
              selected={(settings?.home_chart ?? 'line') === 'line'}
              onPress={() => updateSettings({ home_chart: 'line' })}
            />
            <SelectableRow
              label={t('profile_chart_daily')}
              selected={settings?.home_chart === 'daily'}
              onPress={() => updateSettings({ home_chart: 'daily' })}
            />
          </View>
        </View>

        {/* Уведомления и ИИ + стартовый гайд — «about the app» блок. */}
        <View style={styles.groupCard}>
          <Text style={styles.groupTitle}>{t('profile_notifications_ai')}</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('profile_notifications')}</Text>
            <Switch
              value={settings?.notifications_enabled ?? true}
              onValueChange={(value) => updateSettings({ notifications_enabled: value })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('profile_shopping_reminders')}</Text>
            <Switch
              value={settings?.shopping_reminders_enabled ?? true}
              onValueChange={(value) => updateSettings({ shopping_reminders_enabled: value })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('profile_ai_tips')}</Text>
            <Switch
              value={settings?.ai_tips_enabled ?? true}
              onValueChange={(value) => updateSettings({ ai_tips_enabled: value })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <Pressable style={styles.currencyRow} onPress={() => sendTestNotification()}>
            <Text style={styles.currencyValue}>{t('profile_test_notification')}</Text>
            <Text style={styles.currencyChange}>{t('profile_send')}</Text>
          </Pressable>
          <Pressable style={styles.currencyRow} onPress={() => rootNavigation()?.navigate('IntroPreview')}>
            <Text style={styles.currencyValue}>{t('profile_intro_guide')}</Text>
            <Text style={styles.currencyChange}>{t('profile_view')}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.logoutRow} onPress={signOut}>
          <LogOut color={colors.error} size={18} />
          <Text style={styles.logoutText}>{t('profile_logout')}</Text>
        </Pressable>

        <PrimaryButton
          label={t('profile_delete_account')}
          variant="secondary"
          onPress={handleDeleteAccount}
          loading={deleting}
        />
      </ScrollView>

      <Modal
        visible={editingNickname}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingNickname(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setEditingNickname(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('profile_nickname_sheet_title')}</Text>
            <TextField
              label={t('profile_nickname_label')}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder={t('profile_nickname_placeholder')}
            />
            <PrimaryButton label={t('common_save')} onPress={saveNickname} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 12,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  avatarWrap: {
    width: 76,
    height: 76,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surfaceElevated,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '700',
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nickname: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  // Карточка-«полка»: группирует несколько связанных разделов вместо
  // плоского списка отдельных заголовков — так настройки читаются как
  // несколько понятных блоков, а не разбросанный список.
  groupCard: {
    // Фон карточки = фон страницы (не surface) — иначе строки внутри
    // (тоже surface) сливаются с рамкой и группа перестаёт читаться.
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  groupTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  subLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  list: {
    gap: 8,
  },
  idRow: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  idLabel: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  idValue: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  proIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proInfo: {
    flex: 1,
  },
  proTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  proSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  currencyValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  currencyChange: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  toggleHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  logoutText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
}));
