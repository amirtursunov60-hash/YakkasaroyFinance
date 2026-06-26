-- Расширенная карточка контрагента (gap-map Контрагенты). Добавляем к
-- counterparties реквизиты, нужные для счетов и платежей юрлицам:
-- тип (физлицо/юрлицо), юридический/фактический адрес, банковские реквизиты
-- (банк, расчётный счёт, МФО) и ответственное (контактное) лицо.
-- Все поля необязательные, аддитивно — существующие записи не трогаются.

alter table public.counterparties
  add column if not exists entity_type   text,   -- 'individual' | 'legal'
  add column if not exists address        text,   -- адрес
  add column if not exists bank_name       text,   -- наименование банка
  add column if not exists bank_account    text,   -- расчётный счёт
  add column if not exists bank_mfo        text,   -- МФО / код банка
  add column if not exists contact_person  text;   -- ответственное лицо

-- допустимые значения типа (NULL = не указан)
alter table public.counterparties drop constraint if exists counterparties_entity_type_chk;
alter table public.counterparties add constraint counterparties_entity_type_chk
  check (entity_type is null or entity_type in ('individual', 'legal'));
