// Supabase Edge Function: shopping-reminders
//
// Напоминает пушем о невыполненных пунктах списка покупок. Вызывается по
// расписанию из pg_cron, а не приложением: смысл напоминания в том, чтобы
// прийти, когда приложение закрыто.
//
// Кого именно напоминать, решает SQL-функция shopping_reminder_targets():
// пункт висит дольше 3 часов, уведомления включены, есть токен устройства,
// с прошлого напоминания прошло 12 часов.
//
// Вызывается без пользовательского JWT, поэтому защищена собственным
// секретом: иначе кто угодно смог бы разослать пуши всем пользователям.
//
// Deploy: supabase functions deploy shopping-reminders --no-verify-jwt
// Secret: supabase secrets set REMINDER_CRON_SECRET=...

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo принимает пачками до 100 сообщений за запрос.
const BATCH_SIZE = 100;

type Target = {
  user_id: string;
  push_token: string;
  pending_count: number;
  oldest_text: string | null;
};

function buildBody(target: Target): string {
  const count = Number(target.pending_count) || 0;
  const item = (target.oldest_text ?? '').trim();

  if (count <= 1) {
    return item ? `Не забудьте купить: ${item}` : 'В списке покупок остались невыполненные пункты';
  }
  // Склонение под русский: «ещё 1 товар», «ещё 2 товара», «ещё 5 товаров».
  const rest = count - 1;
  const mod10 = rest % 10;
  const mod100 = rest % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? 'товар' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'товара' : 'товаров';

  return item ? `${item} и ещё ${rest} ${word} в списке покупок` : `В списке покупок ${count} невыполненных пунктов`;
}

Deno.serve(async (req) => {
  try {
    const expected = Deno.env.get('REMINDER_CRON_SECRET');
    if (!expected) {
      console.error('shopping-reminders: REMINDER_CRON_SECRET не задан');
      return jsonResponse({ error: 'Не настроено' }, 500);
    }
    if (req.headers.get('x-reminder-secret') !== expected) {
      return jsonResponse({ error: 'Не авторизовано' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Напрямую через REST, без клиентской библиотеки: нужен один RPC и один
    // update, тянуть ради этого зависимость незачем.
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/shopping_reminder_targets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: '{}',
    });

    if (!rpcResponse.ok) {
      console.error('shopping-reminders: rpc', rpcResponse.status, await rpcResponse.text());
      return jsonResponse({ error: 'Не удалось получить список' }, 500);
    }

    const targets = (await rpcResponse.json()) as Target[];
    if (!Array.isArray(targets) || targets.length === 0) {
      return jsonResponse({ sent: 0 });
    }

    const messages = targets.map((target) => ({
      to: target.push_token,
      title: 'Список покупок',
      body: buildBody(target),
      sound: 'default',
      data: { screen: 'shopping' },
    }));

    // Отметку времени ставим только тем, кому пуш реально ушёл: иначе при
    // сбое Expo пользователь молча остался бы без напоминания ещё на 12 часов.
    const delivered: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const batchTargets = targets.slice(i, i + BATCH_SIZE);

      const pushResponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });

      if (!pushResponse.ok) {
        console.error('shopping-reminders: expo', pushResponse.status, await pushResponse.text());
        continue;
      }

      const result = await pushResponse.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];
      tickets.forEach((ticket: { status?: string }, index: number) => {
        if (ticket?.status === 'ok' && batchTargets[index]) delivered.push(batchTargets[index].user_id);
      });
    }

    if (delivered.length > 0) {
      const now = new Date().toISOString();
      await fetch(
        `${supabaseUrl}/rest/v1/user_settings?user_id=in.(${delivered.join(',')})`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ last_shopping_reminder_at: now }),
        },
      );
    }

    return jsonResponse({ sent: delivered.length, candidates: targets.length });
  } catch (error) {
    console.error('shopping-reminders error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
