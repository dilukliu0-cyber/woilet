import { ChevronRight, ReceiptText, RefreshCw } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import type { TranslationKey } from '../../i18n/translations';
import { colors } from '../../theme/colors';
import type { ReceiptRecord, ReceiptStatus } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';

const STATUS_LABEL_KEY: Record<ReceiptStatus, TranslationKey> = {
  processing: 'receipt_status_processing',
  recognized: 'receipt_status_recognized',
  needs_review: 'receipt_status_needs_review',
  error: 'receipt_status_error',
};

// Если обработка идёт дольше этого — считаем чек зависшим (например,
// приложение закрыли посреди распознавания, и status так и остался
// processing навсегда, никогда не дойдя до error).
const STUCK_PROCESSING_MS = 90_000;

type Props = {
  receipt: ReceiptRecord;
  onPress: () => void;
  style?: object;
  // Кто потратил (для семейных чеков): аватарка/ник владельца.
  ownerAvatarUrl?: string | null;
  ownerName?: string | null;
  // Когда задан и receipt.status === 'error' — на карточке появляется
  // видимая кнопка повторного распознавания вместо того чтобы прятать её
  // в меню долгого нажатия.
  onRescan?: () => void;
};

export function ReceiptListItem({
  receipt,
  onPress,
  style,
  ownerAvatarUrl,
  ownerName,
  onRescan,
}: Props) {
  const t = useT();
  const meta = [receipt.purchase_time?.slice(0, 5), ownerName].filter(Boolean).join(' · ');
  const needsRescan = receipt.status === 'error' ||
    (receipt.status === 'processing' &&
      Date.now() - new Date(receipt.created_at).getTime() > STUCK_PROCESSING_MS);

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <View style={styles.thumbnailWrap}>
        <ReceiptText color={colors.textPrimary} size={20} strokeWidth={1.8} />
        {ownerAvatarUrl && <Image source={{ uri: ownerAvatarUrl }} style={styles.ownerAvatar} />}
        {!ownerAvatarUrl && ownerName && (
          <View style={styles.ownerAvatarFallback}>
            <Text style={styles.ownerAvatarText}>{ownerName[0]?.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.storeName} numberOfLines={1}>{receipt.store_name || t('receipt_store_unknown')}</Text>
        {!!meta && <Text style={styles.dateTime} numberOfLines={1}>{meta}</Text>}
        {receipt.status !== 'recognized' && !needsRescan && (
          <Text style={styles.status}>{t(STATUS_LABEL_KEY[receipt.status])}</Text>
        )}
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.amount} numberOfLines={1}>
          {(receipt.total_amount ?? 0).toFixed(2)} {receipt.currency}
        </Text>
        {needsRescan && onRescan ? (
          <Pressable style={styles.rescanButton} onPress={onRescan} hitSlop={6}>
            <RefreshCw color={colors.textPrimary} size={12} />
            <Text style={styles.rescanText}>{t('expenses_retry_read')}</Text>
          </Pressable>
        ) : (
          <ChevronRight color={colors.textSecondary} size={16} style={styles.chevron} />
        )}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumbnailWrap: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatar: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceElevated,
  },
  ownerAvatarFallback: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  storeName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  dateTime: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  cardRight: {
    alignItems: 'flex-end',
    maxWidth: '43%',
  },
  amount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
    marginTop: 3,
    color: colors.textSecondary,
  },
  chevron: {
    marginTop: 3,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rescanText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
}));
