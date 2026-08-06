import { supabase } from '../api/supabaseClient';
import { productKey } from '../../utils/productKey';

// Умные покупки: прогнозы строятся ТОЛЬКО на реальной истории чеков.
// Если данных мало (меньше 3 покупок товара) — прогноза нет, ничего не выдумываем.

export type RunningOutItem = {
  name: string;
  daysLeft: number; // ≈ через сколько дней закончится (0 = уже пора)
  purchases: number;
};

export type SuggestionItem = {
  name: string;
  count: number;
};

type PurchaseRow = {
  cleaned_name: string;
  receipt: { purchase_date: string | null; created_at: string } | null;
};

function dayKey(row: PurchaseRow): string | null {
  return row.receipt?.purchase_date ?? row.receipt?.created_at?.slice(0, 10) ?? null;
}

export async function fetchSmartShopping(userId: string): Promise<{
  runningOut: RunningOutItem[];
  suggestions: SuggestionItem[];
}> {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('receipt_items')
    .select('cleaned_name, receipt:receipts(purchase_date, created_at)')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(1000);

  const rows = (data ?? []) as unknown as PurchaseRow[];

  // Товар → набор дат покупки (уникальные дни).
  const datesByProduct = new Map<string, Set<string>>();
  const displayName = new Map<string, string>();
  for (const row of rows) {
    const day = dayKey(row);
    if (!day) continue;
    // Общий ключ сопоставления: при сравнении только по lower() разные
    // написания одного товара давали разную частоту покупок, и прогноз
    // «скоро закончится» получался неверным.
    const key = productKey(row.cleaned_name);
    if (!key) continue;
    if (!datesByProduct.has(key)) {
      datesByProduct.set(key, new Set());
      displayName.set(key, row.cleaned_name.trim());
    }
    datesByProduct.get(key)!.add(day);
  }

  const today = Date.now();
  const runningOut: RunningOutItem[] = [];
  const suggestions: SuggestionItem[] = [];

  for (const [key, dateSet] of datesByProduct) {
    const dates = [...dateSet].sort();
    const count = dates.length;

    if (count >= 2) {
      suggestions.push({ name: displayName.get(key)!, count });
    }

    // Прогноз только при ≥3 покупках в разные дни — иначе интервал недостоверен.
    if (count < 3) continue;

    let intervalSum = 0;
    for (let i = 1; i < dates.length; i++) {
      intervalSum += (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
    }
    const avgInterval = intervalSum / (dates.length - 1);
    if (avgInterval < 1) continue;

    const daysSinceLast = (today - new Date(dates[dates.length - 1]).getTime()) / 86400000;
    const daysLeft = Math.round(avgInterval - daysSinceLast);

    // Показываем только то, что реально скоро: в пределах двух недель.
    if (daysLeft <= 14) {
      runningOut.push({ name: displayName.get(key)!, daysLeft: Math.max(daysLeft, 0), purchases: count });
    }
  }

  runningOut.sort((a, b) => a.daysLeft - b.daysLeft);
  suggestions.sort((a, b) => b.count - a.count);

  return { runningOut: runningOut.slice(0, 8), suggestions: suggestions.slice(0, 12) };
}

// ---- Шаблоны покупок ----

export type ShoppingTemplate = {
  id: string;
  name: string;
  items: { id: string; text: string }[];
};

export async function fetchTemplates(userId: string): Promise<ShoppingTemplate[]> {
  const { data } = await supabase
    .from('shopping_templates')
    .select('id, name, shopping_template_items(id, text)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    items: (t as unknown as { shopping_template_items: { id: string; text: string }[] }).shopping_template_items ?? [],
  }));
}

export async function createTemplate(
  userId: string,
  name: string,
  itemTexts: string[],
): Promise<string | null> {
  const { data: template, error } = await supabase
    .from('shopping_templates')
    .insert({ user_id: userId, name })
    .select('id')
    .single();
  if (error || !template) return error?.message ?? 'Не удалось создать шаблон';

  if (itemTexts.length > 0) {
    const { error: itemsError } = await supabase.from('shopping_template_items').insert(
      itemTexts.map((text) => ({ template_id: template.id, user_id: userId, text })),
    );
    if (itemsError) return itemsError.message;
  }
  return null;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await supabase.from('shopping_templates').delete().eq('id', templateId);
}

// Кнопка «Заполнить с помощью ИИ» при создании шаблона — по названию и
// истории покупок предлагает список товаров (см. shopping-template-suggest).
export async function suggestTemplateItems(name: string): Promise<{ items: string[]; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ items?: string[]; error?: string }>(
    'shopping-template-suggest',
    { body: { name } },
  );
  if (error) return { items: [], error: error.message ?? 'Не удалось получить список' };
  if (!data?.items) return { items: [], error: data?.error ?? 'Не удалось получить список' };
  return { items: data.items, error: null };
}

// Свободный запрос пользователя («список для лазаньи», «сборы на дачу») —
// ИИ составляет список товаров с нуля (не из истории покупок, см. edge
// function) для добавления в текущий список покупок. Если запрос — блюдо,
// заодно возвращается краткий рецепт для кнопки «Готовить».
export async function requestAiShoppingList(
  query: string,
): Promise<{ items: string[]; recipe: string[] | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{
    items?: string[];
    recipe?: string[] | null;
    error?: string;
  }>('shopping-ai-generate', { body: { query } });
  if (error) return { items: [], recipe: null, error: error.message ?? 'Не удалось составить список' };
  if (!data?.items) return { items: [], recipe: null, error: data?.error ?? 'Не удалось составить список' };
  return { items: data.items, recipe: data.recipe ?? null, error: null };
}

// «Живое» ИИ-сообщение по уже посчитанным (не выдуманным) прогнозам — см.
// shopping-insights Edge Function. Кэшируется там же, звать не боимся.
export async function fetchShoppingInsight(
  runningOut: RunningOutItem[],
  suggestions: SuggestionItem[],
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{ message: string | null }>('shopping-insights', {
    body: { runningOut, suggestions },
  });
  if (error) return null;
  return data?.message ?? null;
}
