// Язык ответов ИИ.
//
// Раньше все промпты были написаны по-русски и модель отвечала по-русски
// независимо от языка интерфейса: у англоязычного пользователя приложение
// переведено, а ассистент, советы и пуши приходили на русском.
//
// Язык читается на сервере из user_settings, а не передаётся клиентом:
// источник один, и вызывающий код не может забыть его подставить.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type Lang = 'ru' | 'en' | 'cs';

const LANGUAGE_NAMES: Record<Lang, string> = {
  ru: 'Russian',
  en: 'English',
  cs: 'Czech',
};

export async function fetchUserLanguage(serviceClient: SupabaseClient, userId: string): Promise<Lang> {
  const { data } = await serviceClient
    .from('user_settings')
    .select('language')
    .eq('user_id', userId)
    .maybeSingle();

  const language = data?.language;
  return language === 'en' || language === 'cs' ? language : 'ru';
}

/**
 * Указание модели на языке-посреднике (английском), а не на целевом:
 * инструкция на чешском для модели менее однозначна, чем прямое
 * «reply in Czech», а смешение языков в промпте провоцирует смешанный ответ.
 */
export function languageInstruction(lang: Lang): string {
  return (
    `\nWrite your entire answer in ${LANGUAGE_NAMES[lang]}, regardless of the language of the ` +
    `question, the product names or the data you are given. Do not mix languages.\n`
  );
}
