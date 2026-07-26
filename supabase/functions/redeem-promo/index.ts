// Supabase Edge Function: redeem-promo
//
// Активация промокода — единственный способ получить Pro, пока покупки в
// App Store / Google Play не подключены. Проверку делает исключительно
// сервер: клиент в таблицу subscriptions писать не может (у него нет
// insert/update-политик), а сама SQL-функция redeem_promo_code закрыта
// от роли authenticated и вызывается только отсюда с service role.
//
// Deploy: supabase functions deploy redeem-promo

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Не авторизовано' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: 'Не авторизовано' }, 401);

    const { code } = await req.json().catch(() => ({ code: null }));
    if (!code || typeof code !== 'string' || !code.trim()) {
      return jsonResponse({ error: 'Введите промокод', code: 'empty' }, 400);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await serviceClient.rpc('redeem_promo_code', {
      p_code: code,
      // Пользователь берётся из проверенного JWT, а не из тела запроса —
      // иначе можно было бы активировать код на чужой аккаунт.
      p_user: user.id,
    });

    if (error) {
      console.error('redeem_promo_code error', error);
      return jsonResponse({ error: 'Не удалось активировать промокод' }, 500);
    }

    const result = data as { ok: boolean; reason?: string; expires_at?: string | null };
    if (!result?.ok) {
      // Причину возвращаем кодом, а текст подбирает приложение — оно знает
      // язык интерфейса.
      return jsonResponse({ error: 'Промокод не подошёл', code: result?.reason ?? 'not_found' }, 400);
    }

    return jsonResponse({ ok: true, expiresAt: result.expires_at ?? null });
  } catch (error) {
    console.error('redeem-promo error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
