import { supabase } from '../api/supabaseClient';
import type { ChatMessage } from '../../types/chatMessage';
import { translate } from '../../i18n/translate';

type SendChatMessageResult = { reply: ChatMessage; error: null } | { reply: null; error: string };

export async function sendChatMessage(
  message: string,
  receiptId?: string | null,
  receiptLabel?: string | null,
): Promise<SendChatMessageResult> {
  const { data, error } = await supabase.functions.invoke<{ reply?: ChatMessage; error?: string }>('ai-chat', {
    body: { message, receiptId: receiptId ?? null, receiptLabel: receiptLabel ?? null },
  });

  if (error) {
    return { reply: null, error: error.message ?? translate('svc_chat_failed') };
  }
  if (!data?.reply) {
    return { reply: null, error: data?.error ?? translate('svc_chat_failed') };
  }

  return { reply: data.reply, error: null };
}
