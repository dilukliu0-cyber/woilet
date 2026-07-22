import { BlurView } from 'expo-blur';
import { Pencil } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ReceiptListItem } from '../cards/ReceiptListItem';
import { colors } from '../../theme/colors';
import type { ReceiptRecord } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';

type Props = {
  receipt: ReceiptRecord | null;
  onClose: () => void;
  onEdit: () => void;
};

// Удаление теперь свайпом влево по карточке (SwipeToDeleteRow), а
// перезапись распознавания — видимой кнопкой на самой карточке при
// status === 'error'. Долгое нажатие оставлено только для редактирования.
export function ReceiptQuickActions({ receipt, onClose, onEdit }: Props) {
  return (
    <Modal visible={receipt !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        {receipt && (
          <View style={styles.centerWrap}>
            <View style={styles.enlargedCard}>
              <ReceiptListItem receipt={receipt} onPress={() => {}} onLongPress={() => {}} />
            </View>
            <View style={styles.actions}>
              <Pressable style={[styles.actionButton, styles.lastButton]} onPress={onEdit}>
                <Pencil color={colors.textPrimary} size={18} />
                <Text style={styles.actionLabel}>Редактировать</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    width: '86%',
    gap: 14,
  },
  enlargedCard: {
    transform: [{ scale: 1.08 }],
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  actions: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastButton: {
    borderBottomWidth: 0,
  },
  actionLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
}));
