-- pgTAP: демонтаж интеграции ManaJet (20260701090000_drop_manajet_mirror.sql).
-- Инварианты: зеркальных таблиц mj_* и обвязки синка больше нет; читатель
-- Vault переименован в app_secret и доступен только service_role.
begin;
set search_path = extensions, public;
select plan(17);

-- Зеркальные таблицы удалены
select hasnt_table('public', 'mj_funds',           'mj_funds удалена');
select hasnt_table('public', 'mj_periods',         'mj_periods удалена');
select hasnt_table('public', 'mj_purchase_orders', 'mj_purchase_orders удалена');
select hasnt_table('public', 'mj_bills',           'mj_bills удалена');
select hasnt_table('public', 'mj_invoices',        'mj_invoices удалена');
select hasnt_table('public', 'mj_incomes',         'mj_incomes удалена');
select hasnt_table('public', 'mj_stats',           'mj_stats удалена');
select hasnt_table('public', 'mj_stat_values',     'mj_stat_values удалена');
select hasnt_table('public', 'mj_positions',       'mj_positions удалена');
select hasnt_table('public', 'mj_persons',         'mj_persons удалена');
select hasnt_table('public', 'mj_companies',       'mj_companies удалена');
select hasnt_table('public', 'mj_sync_log',        'mj_sync_log удалена');

-- Обвязка синка удалена
select hasnt_function('public', 'mj_cron_sync', array['text[]'], 'mj_cron_sync удалена');
select hasnt_function('public', 'mj_secret',    array['text'],   'mj_secret удалена');
-- cron.job есть только там, где включён pg_cron (на shadow/staging его нет) —
-- обращаемся к таблице лениво, через plpgsql, чтобы тест не падал парсингом.
create function pg_temp._mj_cron_count() returns int language plpgsql as $$
begin
  if to_regclass('cron.job') is null then return 0; end if;
  return (select count(*)::int from cron.job where jobname like 'mj_%');
end $$;
select is(pg_temp._mj_cron_count(), 0, 'cron-джобов mj_* не осталось');

-- Читатель Vault: app_secret есть, клиентским ролям недоступна
select has_function('public', 'app_secret', array['text'], 'app_secret существует');
select ok(
  not has_function_privilege('authenticated', 'public.app_secret(text)', 'execute'),
  'app_secret недоступна роли authenticated');

select * from finish();
rollback;
