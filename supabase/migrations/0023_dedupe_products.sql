-- Автоматическое слияние дублей товаров.
--
-- Нормализация строк тут бессильна: «Birell 0.0 Pomelo» и «Birell 0.0 Помело»
-- не совпадают ни одним символом, а «Coca-Cola Zero без кофеина» и «Напиток
-- Coca-Cola Zero» — тем более. Понять, что это один товар, может только
-- модель. Отметка времени нужна, чтобы разбор запускался сам, но не на
-- каждый чек: вызов стоит денег, а список товаров меняется медленно.

alter table public.user_settings
  add column if not exists last_dedupe_at timestamptz;

comment on column public.user_settings.last_dedupe_at is
  'Когда в последний раз отрабатывало слияние дублей товаров (см. edge function dedupe-products).';

-- Журнал слияний: без него откатить ошибочное объединение было бы нечем.
-- raw_name в receipt_items хранит исходную строку с кассы, но прежнее
-- «человеческое» название после перезаписи восстановить неоткуда.
create table if not exists public.product_merges (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  merged_from text not null,
  merged_into text not null,
  items_updated integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_merges enable row level security;

drop policy if exists "product_merges_select" on public.product_merges;
create policy "product_merges_select"
  on public.product_merges for select
  using (user_id = auth.uid());

-- Пишет только service role из edge-функции.

create index if not exists product_merges_user_created_idx
  on public.product_merges (user_id, created_at desc);
