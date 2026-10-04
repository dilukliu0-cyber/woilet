import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { INTL_LOCALE } from '../../i18n/translations';
import { useT } from '../../i18n/useT';
import type { AppStackParamList } from '../../navigation/types';
import {
  deleteForever,
  loadTrash,
  restoreReceipt,
  TRASH_RETENTION_DAYS,
  type TrashedReceipt,
} from '../../services/receipts/trashService';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { useReceiptsStore } from '../../store/receiptsStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'Trash'>;

export function TrashScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const [entries, setEntries] = useState<TrashedReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadTrash().then((list) => {
        setEntries(list);
        setLoading(false);
      });
    }, []),
  );

  async function restore(entry: TrashedReceipt) {
    setBusyId(entry.id);
    haptics.light();
    const error = await restoreReceipt(entry.id);
    setBusyId(null);
    if (error) return;
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    if (userId) useReceiptsStore.getState().fetch(userId);
  }

  // Подтверждение вторым нажатием: системное окно в вебе не работает.
  async function eraseForever(entry: TrashedReceipt) {
    if (confirmId !== entry.id) {
      haptics.light();
      setConfirmId(entry.id);
      return;
    }
    setBusyId(entry.id);
    const error = await deleteForever(entry);
    setBusyId(null);
    setConfirmId(null);
    if (!error) setEntries((list) => list.filter((e) => e.id !== entry.id));
  }

  function daysLeft(entry: TrashedReceipt) {
    const passed = (Date.now() - new Date(entry.deleted_at).getTime()) / (24 * 3600 * 1000);
    return Math.max(TRASH_RETENTION_DAYS - Math.floor(passed), 0);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('trash_title')} onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>{t('trash_hint', { days: TRASH_RETENTION_DAYS })}</Text>
          {entries.length === 0 && <Text style={styles.empty}>{t('trash_empty')}</Text>}
          {entries.map((entry) => {
            const r = entry.receipt;
            const date = r.purchase_date
              ? new Date(r.purchase_date).toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'long' })
              : '';
            const confirming = confirmId === entry.id;
            return (
              <View key={entry.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.store_name || t('trash_title')}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[date, t('trash_days_left', { days: daysLeft(entry) })].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.amount}>
                  {(r.total_amount ?? 0).toFixed(0)} {r.currency ?? ''}
                </Text>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => restore(entry)}
                  disabled={busyId === entry.id}
                  accessibilityLabel={t('trash_restore')}
                  hitSlop={6}
                >
                  <RotateCcw color={colors.textPrimary} size={20} />
                </Pressable>
                <Pressable
                  style={[styles.iconButton, confirming && styles.iconButtonDanger]}
                  onPress={() => eraseForever(entry)}
                  disabled={busyId === entry.id}
                  accessibilityLabel={t('trash_delete_forever')}
                  hitSlop={6}
                >
                  {confirming ? (
                    <Text style={styles.confirmText}>{t('trash_confirm_forever')}</Text>
                  ) : (
                    <Trash2 color={colors.textSecondary} size={20} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, gap: 10 },
    hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
    empty: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      borderRadius: 16,
      paddingVertical: 12,
      paddingLeft: 14,
      paddingRight: 8,
    },
    name: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
    meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    amount: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
    iconButton: {
      minWidth: 38,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonDanger: { backgroundColor: colors.textPrimary, paddingHorizontal: 8 },
    confirmText: { color: colors.background, fontSize: 12, fontWeight: '700' },
  }),
);
