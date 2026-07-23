import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const t = useT();
  const signUp = useAuthStore((state) => state.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit() {
    if (password !== confirmPassword) {
      setError(t('auth_passwords_mismatch'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signUpError } = await signUp(email.trim(), password);
    setLoading(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <View style={styles.confirmContainer}>
        <Text style={styles.title}>{t('auth_confirm_email_title')}</Text>
        <Text style={styles.subtitle}>{t('auth_confirm_email_body', { email: email.trim() })}</Text>
        <PrimaryButton label={t('auth_to_signin')} onPress={() => navigation.navigate('SignIn')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth_signup_title')}</Text>
        <Text style={styles.subtitle}>{t('auth_signup_subtitle')}</Text>

        <View style={styles.form}>
          <TextField
            label={t('common_email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <TextField
            label={t('common_password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t('auth_password_placeholder_min')}
          />
          <TextField
            label={t('auth_confirm_password_label')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton
            label={t('auth_signup_button')}
            onPress={handleSubmit}
            loading={loading}
            disabled={!email || !password || !confirmPassword}
          />
          <PrimaryButton
            label={t('auth_have_account')}
            variant="secondary"
            onPress={() => navigation.navigate('SignIn')}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  confirmContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  form: {
    gap: 14,
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
}));
