import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function PrimaryButton({ label, onPress, loading, disabled, variant = 'primary' }: Props) {
  const isSecondary = variant === 'secondary';

  if (isSecondary) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={[styles.button, styles.secondary, (disabled || loading) && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.secondaryLabel}>{label}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, styles.primary, (disabled || loading) && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={colors.background} />
      ) : (
        <Text style={styles.primaryLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  button: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Однотонная заливка без градиента и неонового свечения.
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: 'transparent',
  },
  disabled: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
}));
