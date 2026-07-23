import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import type { AppStackParamList } from '../../navigation/types';
import { addIncome } from '../../services/wallet/walletService';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddIncome'>;

export function AddIncomeScreen({ navigation }: Props) {
  const t = useT();
  const userId = useAuthStore((state) => state.session?.user.id);
  const currency = useSettingsStore((state) => state.settings?.currency ?? 'CZK');
  const showToast = useToastStore((state) => state.show);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = Number(amount.replace(',', '.'));
    if (!parsed || parsed <= 0) {
      setError(t('add_income_amount_required'));
      return;
    }
    if (!userId) return;

    setSaving(true);
    const saveError = await addIncome(userId, parsed, currency, note);
    setSaving(false);

    if (saveError) {
      haptics.warning();
      setError(saveError);
      return;
    }
    haptics.success();
    showToast(t('add_income_added_toast'));
    navigation.goBack();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title={t('add_income_title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <TextField
          label={t('add_income_amount_label', { currency })}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="1000"
          autoFocus
        />
        <TextField
          label={t('add_income_note_label')}
          value={note}
          onChangeText={setNote}
          placeholder={t('add_income_note_placeholder')}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <PrimaryButton label={t('common_save')} onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
}));
