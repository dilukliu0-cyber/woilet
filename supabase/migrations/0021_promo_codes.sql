-- Промокоды: способ выдать Pro без магазина приложений — для себя, тестеров
-- и маркетинга. Заменяет собой «кнопку, которая просто включает Pro»:
-- такая кнопка после публикации раздавала бы подписку всем подряд.

create table if not exists public.promo_codes (
  code text primary key,
  -- null = бессрочный доступ, иначе Pro выдаётся на столько дней.
  duration_days integer check (duration_days is null or duration_days > 0),
  -- null = без ограничения по числу активаций.
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
-- Политик нет вообще: и чтение, и запись только через service role.
-- Иначе клиент вычитал бы список всех кодов простым select.

create table if not exists public.promo_redemptions (
  id bigserial primary key,
  code text not null references public.promo_codes(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  -- Один код — одна активация на пользователя. Ограничение на уровне БД,
  -- а не проверкой в коде: так гонка двух одновременных запросов не даст
  -- активировать код дважды.
  unique (code, user_id)
);

alter table public.promo_redemptions enable row level security;

drop policy if exists "promo_redemptions_select" on public.promo_redemptions;
create policy "promo_redemptions_select"
  on public.promo_redemptions for select
  using (user_id = auth.uid());

-- Активация целиком в одной транзакции с блокировкой строки кода: проверка
-- лимита и его расход не должны разъезжаться при параллельных запросах.
create or replace function public.redeem_promo_code(p_code text, p_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.promo_codes%rowtype;
  v_expires timestamptz;
begin
  select * into v_code
  from public.promo_codes
  where code = upper(btrim(p_code)) and active
  for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return json_build_object('ok', false, 'reason', 'exhausted');
  end if;

  if exists (
    select 1 from public.promo_redemptions r
    where r.code = v_code.code and r.user_id = p_user
  ) then
    return json_build_object('ok', false, 'reason', 'already_used');
  end if;

  insert into public.promo_redemptions (code, user_id) values (v_code.code, p_user);
  update public.promo_codes set used_count = used_count + 1 where code = v_code.code;

  v_expires := case
    when v_code.duration_days is null then null
    else now() + make_interval(days => v_code.duration_days)
  end;

  insert into public.subscriptions (user_id, tier, status, platform, product_id, started_at, expires_at, updated_at)
  values (p_user, 'pro', 'active', 'promo', v_code.code, now(), v_expires, now())
  on conflict (user_id) do update
    set tier = 'pro',
        status = 'active',
        platform = 'promo',
        product_id = v_code.code,
        started_at = coalesce(public.subscriptions.started_at, now()),
        expires_at = v_expires,
        updated_at = now();

  return json_build_object('ok', true, 'expires_at', v_expires);
end;
$$;

-- Функция security definer, поэтому доступ к ней обязан быть закрыт: иначе
-- любой вошедший клиент вызвал бы её с чужим p_user и выдал Pro кому угодно.
revoke all on function public.redeem_promo_code(text, uuid) from public;
revoke all on function public.redeem_promo_code(text, uuid) from anon;
revoke all on function public.redeem_promo_code(text, uuid) from authenticated;
