-- ============================================================================
-- pgTAP · Расширенная карточка контрагента (counterparties: реквизиты)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(9);

set search_path = extensions, public;

-- новые колонки карточки
select has_column('public', 'counterparties', 'entity_type', 'counterparties.entity_type есть');
select has_column('public', 'counterparties', 'address', 'counterparties.address есть');
select has_column('public', 'counterparties', 'bank_name', 'counterparties.bank_name есть');
select has_column('public', 'counterparties', 'bank_account', 'counterparties.bank_account есть');
select has_column('public', 'counterparties', 'bank_mfo', 'counterparties.bank_mfo есть');
select has_column('public', 'counterparties', 'contact_person', 'counterparties.contact_person есть');

-- констрейнт на допустимые значения типа
select has_check('public', 'counterparties', 'на counterparties есть CHECK-констрейнт');

-- допустимое значение проходит, недопустимое — отвергается
select lives_ok(
  $$ insert into public.counterparties (name, entity_type) values ('pgTAP юрлицо', 'legal') $$,
  'entity_type=legal проходит'
);

-- недопустимое значение типа отвергается CHECK-констрейнтом
select throws_ok(
  $$ insert into public.counterparties (name, entity_type) values ('pgTAP плохой', 'foo') $$,
  '23514', null,
  'недопустимый entity_type отвергается CHECK'
);

select * from finish();
rollback;
