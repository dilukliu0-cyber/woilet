import { useFocusEffect } from '@react-navigation/native';
import { Paperclip, Receipt as ReceiptIcon, Send, Sparkles, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../services/api/supabaseClient';
import { useT } from '../../i18n/useT';
import { dictionaries } from '../../i18n/translations';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useLocaleStore } from '../../store/localeStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { ProLockedView } from '../../components/subscription/ProLockedView';
import { colors } from '../../theme/colors';
import type { ChatMessage } from '../../types/chatMessage';
import type { ReceiptRecord } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type Attached = { id: string; label: string };

function receiptLabel(r: ReceiptRecord, locale: keyof typeof dictionaries): string {
  const store = r.store_name || dictionaries[locale].receipt_store_unknown;
  const total = r.total_amount != null ? `${r.total_amount.toFixed(2)} ${r.currency}` : '';
  return total ? `${store} · ${total}` : store;
}

export function ChatScreen() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const messages = useChatStore((state) => state.messages);
  const isLoadingHistory = useChatStore((state) => state.isLoadingHistory);
  const isSending = useChatStore((state) => state.isSending);
  const error = useChatStore((state) => state.error);
  const fetchHistory = useChatStore((state) => state.fetchHistory);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const isPro = useSubscriptionStore((state) => state.isPro);

  const [text, setText] = useState('');
  const [attached, setAttached] = useState<Attached | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerReceipts, setPickerReceipts] = useState<ReceiptRecord[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchHistory(userId);
    }, [userId, fetchHistory]),
  );

  async function openPicker() {
    setPickerVisible(true);
    setPickerLoading(true);
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setPickerReceipts(data ?? []);
    setPickerLoading(false);
  }

  function pickReceipt(r: ReceiptRecord) {
    setAttached({ id: r.id, label: receiptLabel(r, locale) });
    setPickerVisible(false);
  }

  async function handleSend() {
    if (!userId || !text.trim() || isSending) return;
    haptics.light();
    const toSend = text;
    const attachment = attached;
    setText('');
    setAttached(null);
    await sendMessage(userId, toSend, attachment?.id, attachment?.label);
  }

  // Мессенджерский порядок: новые сообщения снизу — data идёт в обратном
  // порядке, а inverted переворачивает список, поэтому он всегда «прилипает»
  // к последнему сообщению и не съезжает под клавиатуру.
  const reversedMessages = [...messages].reverse();

  function renderItem({ item }: { item: ChatMessage }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {item.receipt_label && (
            <View style={styles.attachmentTag}>
              <ReceiptIcon color={isUser ? colors.background : colors.accent} size={12} />
              <Text style={[styles.attachmentTagText, isUser && styles.attachmentTagTextUser]}>
                {item.receipt_label}
              </Text>
            </View>
          )}
          <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{item.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Sparkles color={colors.accent} size={20} />
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>{t('chat_assistant_title')}</Text>
          <View style={styles.statusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.statusText}>{t('chat_online')}</Text>
          </View>
        </View>
      </View>

      {/* Бесплатный тариф: показываем объяснение вместо чата. Сервер всё
          равно отказал бы (402), но лучше не давать написать сообщение
          впустую. */}
      {!isPro ? (
        <ProLockedView description={t('subscription_locked_chat')} />
      ) : (
        <>
      <FlatList
        ref={listRef}
        data={reversedMessages}
        inverted
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !isLoadingHistory ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t('chat_empty_hint')}</Text>
            </View>
          ) : null
        }
      />

      {isSending && (
        <View style={styles.typingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.typingText}>{t('chat_thinking')}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {attached && (
        <View style={styles.attachedRow}>
          <ReceiptIcon color={colors.accent} size={14} />
          <Text style={styles.attachedText} numberOfLines={1}>
            {attached.label}
          </Text>
          <Pressable onPress={() => setAttached(null)} hitSlop={8}>
            <X color={colors.textSecondary} size={16} />
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        <Pressable style={styles.clipButton} onPress={openPicker} hitSlop={6}>
          <Paperclip color={colors.textSecondary} size={20} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat_input_placeholder')}
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isSending}
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={isSending || !text.trim()}>
          <Send color={colors.background} size={18} />
        </Pressable>
      </View>
        </>
      )}

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('chat_attach_receipt_title')}</Text>
            {pickerLoading ? (
              <ActivityIndicator color={colors.accent} style={styles.pickerLoading} />
            ) : (
              <FlatList
                data={pickerReceipts}
                keyExtractor={(item) => item.id}
                style={styles.pickerList}
                contentContainerStyle={styles.pickerListContent}
                ListEmptyComponent={<Text style={styles.emptyText}>{t('chat_no_receipts')}</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.pickerRow} onPress={() => pickReceipt(item)}>
                    <ReceiptIcon color={colors.accent} size={20} strokeWidth={1.75} />
                    <View style={styles.pickerInfo}>
                      <Text style={styles.pickerStore}>{item.store_name || t('receipt_store_unknown')}</Text>
                      <Text style={styles.pickerDate}>
                        {[item.purchase_date, item.purchase_time].filter(Boolean).join(' ')}
                      </Text>
                    </View>
                    <Text style={styles.pickerTotal}>
                      {(item.total_amount ?? 0).toFixed(2)} {item.currency}
                    </Text>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  statusText: {
    color: colors.accent,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  // FlatList inverted переворачивает контент — компенсируем, чтобы текст
  // подсказки читался нормально, а не вверх ногами.
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: {
    color: colors.background,
    fontSize: 15,
  },
  bubbleTextAssistant: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  attachmentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  attachmentTagText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentTagTextUser: {
    color: colors.background,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  typingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachedText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clipButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
    maxHeight: '75%',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  pickerLoading: {
    marginVertical: 30,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerListContent: {
    gap: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 12,
  },
  pickerInfo: {
    flex: 1,
  },
  pickerStore: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerDate: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  pickerTotal: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
}));
