import { Receipt as ReceiptIcon, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getReceiptImageUrl } from '../../services/receipts/receiptImage';
import { colors } from '../../theme/colors';
import type { ReceiptRecord, ReceiptStatus } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  processing: 'Обрабатывается',
  recognized: 'Распознано',
  needs_review: 'Нужно проверить',
  error: 'Ошибка',
};

const STATUS_COLOR: Record<ReceiptStatus, string> = {
  processing: colors.textSecondary,
  recognized: colors.success,
  needs_review: colors.warning,
  error: colors.error,
};

// Если обработка идёт дольше этого — считаем чек зависшим (например,
// приложение закрыли посреди распознавания, и status так и остался
// processing навсегда, никогда не дойдя до error).
const STUCK_PROCESSING_MS = 90_000;

type Props = {
  receipt: ReceiptRecord;
  onPress: () => void;
  onLongPress: () => void;
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
  onLongPress,
  style,
  ownerAvatarUrl,
  ownerName,
  onRescan,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReceiptImageUrl(receipt.image_path).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [receipt.image_path]);

  return (
    <Pressable
      style={[styles.card, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={styles.thumbnailWrap}>
        <View style={styles.thumbnail}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.thumbnailImage} />
          ) : (
            <ReceiptIcon color={colors.textSecondary} size={20} />
          )}
        </View>
        {ownerAvatarUrl && <Image source={{ uri: ownerAvatarUrl }} style={styles.ownerAvatar} />}
        {!ownerAvatarUrl && ownerName && (
          <View style={styles.ownerAvatarFallback}>
            <Text style={styles.ownerAvatarText}>{ownerName[0]?.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.storeName}>{receipt.store_name || 'Магазин не распознан'}</Text>
        <Text style={styles.dateTime}>
          {[receipt.purchase_date, receipt.purchase_time].filter(Boolean).join(' ')}
          {ownerName ? ` · ${ownerName}` : ''}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.amount}>
          {(receipt.total_amount ?? 0).toFixed(2)} {receipt.currency}
        </Text>
        {(receipt.status === 'error' ||
          (receipt.status === 'processing' &&
            Date.now() - new Date(receipt.created_at).getTime() > STUCK_PROCESSING_MS)) &&
        onRescan ? (
          <Pressable style={styles.rescanButton} onPress={onRescan} hitSlop={6}>
            <RefreshCw color={colors.error} size={12} />
            <Text style={styles.rescanText}>Прочитать снова</Text>
          </Pressable>
        ) : (
          <Text style={[styles.status, { color: STATUS_COLOR[receipt.status] }]}>
            {STATUS_LABEL[receipt.status]}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  thumbnailWrap: {
    width: 48,
    height: 60,
  },
  thumbnail: {
    width: 48,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    flex: 1,
  },
  storeName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  dateTime: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  amount: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    fontSize: 12,
    marginTop: 4,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  rescanText: {
    color: colors.error,
    fontSize: 11,
    fontWeight: '600',
  },
}));
