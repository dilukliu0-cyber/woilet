import { useFocusEffect } from '@react-navigation/native';
import { Check, ShoppingCart, Sparkles, Trash2, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Skeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../services/api/supabaseClient';
import { useT } from '../../i18n/useT';
import { useAuthStore } from '../../store/authStore';
import { useShoppingListStore } from '../../store/shoppingListStore';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';
import type { ShoppingListItem } from '../../types/shoppingList';
import { haptics } from '../../utils/haptics';

const FORGOTTEN_AFTER_DAYS = 7;

// Единственный экран списка покупок. Создание списков и рецептов через
// ИИ теперь целиком живёт в общем чате («сделай список для лазаньи») —
// здесь только сам список: добавить/отметить/удалить товар вручную.
export function ShoppingScreen() {
  const t = useT();
  const userId = useAuthStore((state) => state.session?.user.id);
  const items = useShoppingListStore((state) => state.items);
  const isLoading = useShoppingListStore((state) => state.isLoading);
  const init = useShoppingListStore((state) => state.init);
  const addItem = useShoppingListStore((state) => state.addItem);
  const toggleItem = useShoppingListStore((state) => state.toggleItem);
  const deleteItem = useShoppingListStore((state) => state.deleteItem);

  const [text, setText] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (userId) init(userId);
    }, [userId, init]),
  );

  async function handleAdd() {
    if (!text.trim()) return;
    haptics.light();
    await addItem(text);
    setText('');
  }

  // «Кажется, ты не купил X» — самый старый неотмеченный пункт старше 7 дней.
  const forgotten = items.find(
    (item) =>
      !item.checked &&
      Date.now() - new Date(item.created_at).getTime() > FORGOTTEN_AFTER_DAYS * 86400000,
  );

  async function keepForgotten(item: ShoppingListItem) {
    // «Да, оставить» — сбрасываем возраст пункта, чтобы не спрашивать ещё неделю.
    await supabase.from('shopping_list_items').update({ created_at: new Date().toISOString() }).eq('id', item.id);
    if (userId) init(userId);
  }

  const pending = items.filter((item) => !item.checked);
  const checked = items.filter((item) => item.checked);

  function renderItem({ item }: { item: ShoppingListItem }) {
    return (
      <View style={styles.itemRow}>
        <Pressable
          style={[styles.checkbox, item.checked && styles.checkboxChecked]}
          onPress={() => {
            haptics.selection();
            toggleItem(item.id, !item.checked);
          }}
        >
          {item.checked && <Check color={colors.background} size={14} />}
        </Pressable>
        <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>{item.text}</Text>
        <Pressable
          onPress={() => {
            haptics.warning();
            deleteItem(item.id);
          }}
          hitSlop={8}
        >
          <Trash2 color={colors.textSecondary} size={16} />
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <ShoppingCart color={colors.accent} size={26} strokeWidth={1.75} />
        <Text style={styles.title}>{t('shopping_title')}</Text>
      </View>

      <FlatList
        data={[...pending, ...checked]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          forgotten ? (
            <View style={styles.forgotCard}>
              <Text style={styles.forgotText}>{t('shopping_forgot_text', { item: forgotten.text })}</Text>
              <View style={styles.forgotActions}>
                <Pressable style={styles.forgotYes} onPress={() => keepForgotten(forgotten)}>
                  <Text style={styles.forgotYesText}>{t('shopping_forgot_yes')}</Text>
                </Pressable>
                <Pressable style={styles.forgotNo} onPress={() => deleteItem(forgotten.id)}>
                  <Text style={styles.forgotNoText}>{t('shopping_forgot_no')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height={54} borderRadius={14} style={{ marginBottom: 8 }} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Sparkles color={colors.textSecondary} size={26} />
              <Text style={styles.emptyText}>{t('shopping_empty')}</Text>
            </View>
          )
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('shopping_add_placeholder')}
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Plus color={colors.background} size={20} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
    paddingBottom: 24,
  },
  forgotCard: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  forgotText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
  },
  forgotActions: {
    flexDirection: 'row',
    gap: 10,
  },
  forgotYes: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  forgotYesText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '600',
  },
  forgotNo: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  forgotNoText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 10,
    marginTop: 40,
    paddingHorizontal: 20,
  },
  skeletonWrap: {
    marginTop: 4,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
  },
  itemText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
  },
  itemTextChecked: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
