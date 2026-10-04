import { Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import type { IncomeRecord } from '../../types/income';
import { haptics } from '../../utils/haptics';

// Окно кошелька: баланс, все пополнения и удаление каждого.
//
// Раньше пополнение удалялось только долгим нажатием по строке в общей
// ленте — это нигде не было видно, а строки к тому же прятались внутри
// свёрнутых месяцев. Здесь у каждой строки своя кнопка. Подтверждение —
// вторым нажатием в той же строке, а не системным окном: Alert в вебе
// не работает вовсе.
export function WalletSheet({
  visible,
  onClose,
  balance,
  totalIncome,
  currency,
  incomes,
  intlLocale,
  onDelete,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  balance: number;
  totalIncome: number;
  currency: string;
  incomes: IncomeRecord[];
  intlLocale: string;
  onDelete: (income: IncomeRecord) => Promise<void>;
  onAdd: () => void;
}) {
  const t = useT();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleTrash(income: IncomeRecord) {
    if (confirmId !== income.id) {
      haptics.light();
      setConfirmId(income.id);
      return;
    }
    setDeletingId(income.id);
    await onDelete(income);
    setDeletingId(null);
    setConfirmId(null);
  }

  const sorted = [...incomes].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('expenses_wallet')}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X color={colors.textPrimary} size={22} />
          </Pressable>
        </View>

        <Text style={styles.caption}>{t('expenses_wallet_balance')}</Text>
        <Text style={styles.balance}>
          {balance.toFixed(0)} {currency}
        </Text>
        <Text style={styles.caption}>
          {t('expenses_topups_history')} +{totalIncome.toFixed(0)} {currency}
        </Text>

        <Pressable
          style={styles.addButton}
          onPress={() => {
            onClose();
            onAdd();
          }}
        >
          <Plus color={colors.background} size={18} />
          <Text style={styles.addText}>{t('expenses_action_income')}</Text>
        </Pressable>

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('expenses_topups_empty')}</Text>}
          renderItem={({ item }) => {
            const confirming = confirmId === item.id;
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.note} numberOfLines={1}>
                    {item.note?.trim() || t('expenses_income_fallback')}
                  </Text>
                  <Text style={styles.date}>
                    {new Date(item.created_at).toLocaleDateString(intlLocale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={styles.amount}>
                  +{item.amount.toFixed(0)} {item.currency}
                </Text>
                <Pressable
                  style={[styles.trash, confirming && styles.trashConfirm]}
                  onPress={() => handleTrash(item)}
                  disabled={deletingId === item.id}
                  hitSlop={6}
                >
                  {confirming ? (
                    <Text style={styles.trashConfirmText}>{t('common_delete')}</Text>
                  ) : (
                    <Trash2 color={colors.textSecondary} size={18} />
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '82%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 2,
      borderColor: colors.cardBorder,
      padding: 20,
      paddingBottom: 36,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
    caption: { color: colors.textSecondary, fontSize: 13 },
    balance: { color: colors.textPrimary, fontSize: 34, fontWeight: '800', marginVertical: 4 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 12,
      marginTop: 16,
      marginBottom: 8,
    },
    addText: { color: colors.background, fontSize: 15, fontWeight: '700' },
    list: { marginTop: 8 },
    separator: { height: 1, backgroundColor: colors.border, opacity: 0.25 },
    empty: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    note: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
    date: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    amount: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
    trash: { minWidth: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    trashConfirm: { backgroundColor: colors.accent, paddingHorizontal: 10 },
    trashConfirmText: { color: colors.background, fontSize: 13, fontWeight: '700' },
  }),
);
