-- Расписание напоминаний о покупках.
--
-- Проверка ежечасная, хотя само напоминание уходит не чаще раза в 12 часов
-- (это решает shopping_reminder_targets). Частая проверка нужна, чтобы
-- поймать момент, когда пункт «дозрел» до трёх часов, а не ждать полсуток.
--
-- Секрет функции читается из Vault прямо в момент вызова, поэтому в файле
-- его нет и миграцию можно держать в репозитории. Сам секрет заводится
-- отдельно (vault.create_secret) и должен совпадать с переменной окружения
-- REMINDER_CRON_SECRET у edge-функции.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'shopping-reminders-hourly') then
    perform cron.unschedule('shopping-reminders-hourly');
  end if;
end;
$$;

select cron.schedule(
  'shopping-reminders-hourly',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://mcfsrdxrwykyzwpzsldl.supabase.co/functions/v1/shopping-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
