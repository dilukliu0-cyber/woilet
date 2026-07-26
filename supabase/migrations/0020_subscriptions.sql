-- Подписка Pro: серверное состояние + квоты бесплатного тарифа.
--
-- Ключевое требование безопасности: клиент НЕ должен уметь выдать себе Pro.
-- Поэтому состояние подписки лежит в отдельной таблице, где у пользователя
-- есть только select своей строки, а insert/update/delete не разрешены
-- никому — писать может лишь service role (edge-функция стора/вебхук),
-- который RLS обходит. Если бы tier лежал в user_settings, любой клиент
-- обычным update выставил бы себе 'pro'.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'in_trial', 'in_grace', 'expired', 'cancelled')),
  -- Откуда пришла подписка: магазин или ручная выдача (промо, тестеры).
  platform text check (platform in ('ios', 'android', 'promo')),
  product_id text,
  store_transaction_id text,
  started_at timestamptz,
  -- null = бессрочно (промо-доступ). Иначе доступ живёт до этой даты.
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- insert/update/delete-политик намеренно нет: только service role.

-- Отсутствие строки трактуется как free — это избавляет от необходимости
-- заводить строку при регистрации и от лишней связки с handle_new_user.
create or replace function public.has_pro_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.tier = 'pro'
      and s.status in ('active', 'in_trial', 'in_grace')
      and (s.expires_at is null or s.expires_at > now())
  );
$$;

-- Квоты бесплатного тарифа считаем по ai_api_usage, а не по таблице чеков:
-- записи об использовании ИИ пользователь удалить не может (нет insert/delete
-- политик, пишет только service role), а чек — может. Иначе лимит обнулялся бы
-- простым удалением своих чеков.
alter table public.ai_api_usage
  add column if not exists kind text not null default 'other';

comment on column public.ai_api_usage.kind is
  'Тип вызова ИИ: scan | chat | digest | shopping. Используется для месячных квот бесплатного тарифа.';

create index if not exists ai_api_usage_user_kind_created_idx
  on public.ai_api_usage (user_id, kind, created_at desc);

-- Создание семьи — возможность тарифа Pro. Политика ограничивает только
-- создание новых семей: уже существующие семьи и их участники продолжают
-- работать как раньше. Приглашённых участников намеренно не гатим — платит
-- владелец, остальные входят по его подписке (семейный тариф).
drop policy if exists "families_insert" on public.families;
create policy "families_insert"
  on public.families for insert
  with check (owner_id = auth.uid() and public.has_pro_access(auth.uid()));
