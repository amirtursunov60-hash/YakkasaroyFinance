-- pgTAP: журнал ошибок фронта client_errors (миграция 20260702120000, ADR-0009).
-- Инварианты: таблица есть, RLS включён, insert — только authenticated от себя,
-- select/update — только финадмины, delete-политики нет (архив вместо удаления).

begin;
select plan(7);

select has_table('public', 'client_errors', 'таблица client_errors существует');
select ok((select relrowsecurity from pg_class where relname = 'client_errors'), 'RLS включён');

select policies_are('public', 'client_errors',
  array['client_errors_insert', 'client_errors_read', 'client_errors_update'],
  'ровно три политики: insert / read / update (delete нет — архив вместо удаления)');

select policy_cmd_is('public', 'client_errors', 'client_errors_insert', 'insert', 'insert-политика на INSERT');
select policy_cmd_is('public', 'client_errors', 'client_errors_read', 'select', 'read-политика на SELECT');
select policy_cmd_is('public', 'client_errors', 'client_errors_update', 'update', 'update-политика на UPDATE');

select col_not_null('public', 'client_errors', 'message', 'message обязателен');

select * from finish();
rollback;
