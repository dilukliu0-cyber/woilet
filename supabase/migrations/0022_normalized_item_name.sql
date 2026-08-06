-- Каноническое имя товара: ключ для сопоставления одинаковых покупок.
--
-- Проблема: cleanedName приходит от модели и каждый раз чуть разный
-- («Куриное филе», «филе куриное», «Куриное  филе»), а экраны сравнивали
-- названия по-разному — где-то точной строкой, где-то через lower(). Из-за
-- этого один товар распадался на несколько.
--
-- Отображается по-прежнему cleaned_name, а normalized_name используется
-- только для группировки и поиска.

create or replace function public.normalize_item_name(raw text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select string_agg(word, ' ' order by word)
      from unnest(
        string_to_array(
          btrim(
            regexp_replace(
              -- Разделитель дробей убираем совсем, чтобы «3.2%» и «3,2%»
              -- давали один ключ, но «1.5%» оставалось отличным от «3.2%»:
              -- жирность и объём — это разные товары, их слипание исказило
              -- бы и историю цен, и аналитику.
              regexp_replace(
                -- Апострофы удаляются, а не заменяются пробелом: иначе
                -- «Lay's» распадается на «lay» + «s» и перестаёт совпадать
                -- с «Lays».
                translate(lower(coalesce(raw, '')), E'ё\'’‘`', 'е'),
                '(\d)[.,](\d)', '\1\2', 'g'
              ),
              -- Всё, кроме букв, цифр и процента, считаем оформлением:
              -- «Lay's» и «Lays», «Кока-кола» и «Кока кола» — один товар.
              '[^a-z0-9а-я%]+', ' ', 'g'
            )
          ),
          ' '
        )
      ) as word
      where word <> ''
    ),
    ''
  );
$$;

comment on function public.normalize_item_name(text) is
  'Ключ сопоставления товаров: нижний регистр, ё→е, без пунктуации, слова отсортированы (порядок слов в названии не важен).';

alter table public.receipt_items
  add column if not exists normalized_name text;

create or replace function public.receipt_items_set_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_item_name(new.cleaned_name);
  return new;
end;
$$;

drop trigger if exists receipt_items_normalized_name on public.receipt_items;
create trigger receipt_items_normalized_name
  before insert or update of cleaned_name on public.receipt_items
  for each row execute function public.receipt_items_set_normalized_name();

-- Существующие записи: без этого старые покупки остались бы вне группировки.
update public.receipt_items
set normalized_name = public.normalize_item_name(cleaned_name)
where normalized_name is null;

create index if not exists receipt_items_user_normalized_idx
  on public.receipt_items (user_id, normalized_name);
