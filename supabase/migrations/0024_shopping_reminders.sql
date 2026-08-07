-- Напоминания о забытых покупках.
--
-- Смысл в том, чтобы напомнить, когда приложение НЕ открыто, поэтому клиент
-- тут не помощник: существующий пуш из ai-digest уходит только когда
-- пользователь сам зашёл на Главную. Нужен планировщик на стороне БД.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.user_settings
  add column if not exists shopping_reminders_enabled boolean not null default true,
  add column if not exists last_shopping_reminder_at timestamptz;

comment on column public.user_settings.shopping_reminders_enabled is
  'Напоминать ли пушем о невыполненных пунктах списка покупок.';
comment on column public.user_settings.last_shopping_reminder_at is
  'Когда в последний раз отправлено напоминание — чтобы не чаще раза в 12 часов.';

-- Кого напоминать. Условия: пункт висит дольше 3 часов, уведомления не
-- выключены, есть токен устройства и с прошлого напоминания прошло 12 часов.
-- Вынесено в функцию, чтобы edge-функция не дублировала эту логику и её
-- можно было проверить обычным select.
create or replace function public.shopping_reminder_targets()
returns table (user_id uuid, push_token text, pending_count bigint, oldest_text text)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    s.push_token,
    count(i.id) as pending_count,
    (array_agg(i.text order by i.created_at))[1] as oldest_text
  from public.user_settings s
  join public.shopping_list_items i on i.user_id = s.user_id
  where s.push_token is not null
    and s.notifications_enabled is distinct from false
    and s.shopping_reminders_enabled
    and i.checked = false
    and i.created_at < now() - interval '3 hours'
    and (s.last_shopping_reminder_at is null
         or s.last_shopping_reminder_at < now() - interval '12 hours')
  group by s.user_id, s.push_token;
$$;

revoke all on function public.shopping_reminder_targets() from public;
revoke all on function public.shopping_reminder_targets() from anon;
revoke all on function public.shopping_reminder_targets() from authenticated;

-- Расписание: раз в час. Само напоминание всё равно уходит не чаще раза в
-- 12 часов, но частая проверка позволяет поймать момент, когда пункт
-- «дозрел» до трёх часов, а не ждать полсуток.
--
-- Адрес и ключ проекта подставляются при деплое (см. README раздела
-- «Напоминания»): в миграции их держать нельзя — это секреты.
