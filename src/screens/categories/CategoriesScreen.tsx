import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useCategoriesStore } from '../../store/categoriesStore';
import { useLocaleStore } from '../../store/localeStore';
import { colors } from '../../theme/colors';
import { getCategoryIcon, SELECTABLE_ICON_NAMES } from '../../utils/categoryIcons';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AppStackParamList, 'Categories'>;

export function CategoriesScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const categories = useCategoriesStore((state) => state.categories);
  const fetchCategories = useCategoriesStore((state) => state.fetch);
  const addCategory = useCategoriesStore((state) => state.addCategory);

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(SELECTABLE_ICON_NAMES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchCategories(userId);
    }, [userId, fetchCategories]),
  );

  function openModal() {
    setName('');
    setIcon(SELECTABLE_ICON_NAMES[0]);
    setError(null);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!userId || !name.trim()) {
      setError(t('categories_name_required'));
      return;
    }
    setSaving(true);
    const err = await addCategory(userId, name.trim(), icon);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setModalVisible(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('categories_title')}</Text>
        <Pressable style={styles.iconButton} onPress={openModal}>
          <Plus color={colors.accent} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            return (
              <View key={category.id} style={styles.tile}>
                <View style={[styles.tileIconWrap, { backgroundColor: `${category.color}22` }]}>
                  <Icon color={category.color} size={22} />
                </View>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {translateCategoryName(category.name, locale)}
                </Text>
                {!category.is_default && <Text style={styles.customBadge}>{t('categories_custom_badge')}</Text>}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.kavFill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('categories_new_title')}</Text>
            <TextField
              label={t('categories_name_label')}
              value={name}
              onChangeText={setName}
              placeholder={t('categories_name_placeholder')}
            />
            <Text style={styles.sheetLabel}>{t('categories_icon_label')}</Text>
            <ScrollView style={styles.iconList} contentContainerStyle={styles.iconGrid}>
              {SELECTABLE_ICON_NAMES.map((iconName) => {
                const Icon = getCategoryIcon(iconName);
                const selected = icon === iconName;
                return (
                  <Pressable
                    key={iconName}
                    style={[styles.iconTile, selected && styles.iconTileSelected]}
                    onPress={() => setIcon(iconName)}
                  >
                    <Icon color={selected ? colors.accent : colors.textSecondary} size={20} />
                  </Pressable>
                );
              })}
            </ScrollView>
            {error && <Text style={styles.errorText}>{error}</Text>}
            <PrimaryButton label={t('common_save')} onPress={handleSave} loading={saving} />
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '30%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
  },
  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  customBadge: {
    color: colors.accent,
    fontSize: 10,
  },
  kavFill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
    maxHeight: '85%',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  iconList: {
    maxHeight: 180,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconTileSelected: {
    borderColor: colors.accent,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
}));
