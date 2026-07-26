import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Lock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../ui/PrimaryButton';
import { useT } from '../../i18n/useT';
import type { AppStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

// Заглушка вместо содержимого экрана/блока, доступного только по подписке.
// Сервер всё равно откажет бесплатному тарифу — этот экран нужен, чтобы
// пользователь увидел понятное объяснение, а не пустоту или ошибку.
type Props = {
  description: string;
};

export function ProLockedView({ description }: Props) {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const goToSubscription = () =>
    (navigation.getParent<NativeStackNavigationProp<AppStackParamList>>() ?? navigation).navigate('Subscription');

  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Lock color={colors.accent} size={26} />
      </View>
      <Text style={styles.title}>{t('subscription_locked_title')}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.buttonWrap}>
        <PrimaryButton label={t('subscription_learn_more')} onPress={goToSubscription} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonWrap: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
}));
