// Supabase Edge Function: delete-account
//
// Полное удаление аккаунта (§34): файлы из Storage, затем auth-пользователь —
// все строки в таблицах уходят каскадом по внешним ключам on delete cascade.
// Только service role может удалить auth-пользователя, поэтому это функция,
// а не клиентский код.

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
    if (!authHeader) {
      return jsonResponse({ error: 'Не авторизовано' }, 401);
    }

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

    if (userError || !user) {
      return jsonResponse({ error: 'Не авторизовано' }, 401);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Оба бакета, а не только чеки: аватарки лежат в публичном бакете, и
    // недоудалённый файл остался бы доступен по прямой ссылке навсегда —
    // это прямое нарушение права на удаление данных.
    await clearUserFolder(serviceClient, 'receipts', user.id);
    await clearUserFolder(serviceClient, 'avatars', user.id);

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('delete-account error', deleteError);
      return jsonResponse({ error: 'Не удалось удалить аккаунт' }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('delete-account error', error);
    return jsonResponse({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

// Storage отдаёт файлы страницами, поэтому одного list() мало: у активного
// пользователя чеков легко больше лимита, и «хвост» остался бы в хранилище
// после удаления аккаунта.
async function clearUserFolder(
  serviceClient: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const pageSize = 100;
  // Всегда читаем первую страницу: после remove() выборка сдвигается, и
  // наращивание offset пропускало бы файлы. Ограничитель нужен, чтобы
  // молчаливый отказ удаления не превратился в бесконечный цикл.
  for (let guard = 0; guard < 200; guard++) {
    const { data: files, error } = await serviceClient.storage
      .from(bucket)
      .list(userId, { limit: pageSize });

    if (error) {
      console.error(`delete-account: не удалось прочитать ${bucket}`, error);
      return;
    }
    if (!files || files.length === 0) return;

    const { error: removeError } = await serviceClient.storage
      .from(bucket)
      .remove(files.map((file) => `${userId}/${file.name}`));

    if (removeError) {
      console.error(`delete-account: не удалось удалить файлы ${bucket}`, removeError);
      return;
    }
  }
  console.error(`delete-account: превышен лимит страниц при очистке ${bucket}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
