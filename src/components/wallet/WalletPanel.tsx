import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Экран кошелька (четвёртый пункт колеса над карточкой): баланс и сумма
// всех пополнений. Сами пополнения — списком под карточкой, со свайпом
// влево для удаления, как у чеков.
export function WalletPanel({
  balance,
  totalIncome,
  currency,
}: {
  balance: number;
  totalIncome: number;
  currency: string;
}) {
  const t = useT();
  return (
    <View>
      <Text style={styles.caption}>{t('expenses_wallet_balance')}</Text>
      <Text style={styles.balance}>
        {balance.toFixed(0)} {currency}
      </Text>
      <Text style={styles.caption}>
        {t('expenses_topups_history')} +{totalIncome.toFixed(0)} {currency}
      </Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    caption: { color: colors.textSecondary, fontSize: 13 },
    balance: { color: colors.textPrimary, fontSize: 34, fontWeight: '800', marginVertical: 4 },
  }),
);
