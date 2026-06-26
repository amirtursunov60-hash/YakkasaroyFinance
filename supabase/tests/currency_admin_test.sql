-- ============================================================================
-- pgTAP · CRUD валют и курсов из UI (политики + RPC базовой валюты)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(6);

set search_path = extensions, public;

-- write-политики валют
select policy_cmd_is('public', 'currencies', 'currencies_insert', 'INSERT', 'currencies_insert есть');
select policy_cmd_is('public', 'currencies', 'currencies_update', 'UPDATE', 'currencies_update есть');

-- update/delete-политики курсов
select policy_cmd_is('public', 'exchange_rates', 'rates_update', 'UPDATE', 'rates_update есть');
select policy_cmd_is('public', 'exchange_rates', 'rates_delete', 'DELETE', 'rates_delete есть');

-- RPC смены базовой валюты
select has_function('public', 'fp_set_base_currency', array['uuid'], 'fp_set_base_currency(uuid) есть');

-- инвариант: базовая валюта ровно одна
select is(
  (select count(*)::int from public.currencies where is_base),
  1, 'базовая валюта ровно одна'
);

select * from finish();
rollback;
