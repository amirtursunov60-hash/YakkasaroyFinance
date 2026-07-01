-- pgTAP: дата проводки в fp_postings (миграция 20260702090000).
-- Инвариант: строка Реестра в периоде → posted_on = конец недели (ends_on);
-- внепериодная строка (period_id IS NULL) → posted_on = дата создания (Душанбе).
-- Запуск на ветке/staging: supabase test db (фикстуры откатываются транзакцией).

begin;
select plan(3);

-- Фикстуры: пользователь, неделя чт–ср, две операции adjustment
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'pgtap@test.local');
insert into profiles (id, full_name, role) values ('22222222-2222-2222-2222-222222222222', 'pgTAP Тест', 'owner');
insert into fp_periods (id, starts_on, ends_on, status)
  values ('11111111-1111-1111-1111-111111111111', '2026-07-02', '2026-07-08', 'open');
with acc as (select id from cash_accounts limit 1)
insert into fp_register (op_type, period_id, cash_account_id, cash_amount, comment, created_at, created_by)
select 'adjustment'::register_op_type, '11111111-1111-1111-1111-111111111111'::uuid, acc.id, 100,
       'pgtap: в периоде', '2026-07-03 10:00+05'::timestamptz, '22222222-2222-2222-2222-222222222222'::uuid from acc
union all
select 'adjustment'::register_op_type, null, acc.id, 50,
       'pgtap: внепериодная', '2026-07-03 10:00+05'::timestamptz, '22222222-2222-2222-2222-222222222222'::uuid from acc;

select has_function('public', 'fp_postings', array['uuid'], 'fp_postings(uuid) существует');

select is(
  (select posted_on from fp_postings('11111111-1111-1111-1111-111111111111') where comment = 'pgtap: в периоде' limit 1),
  date '2026-07-08',
  'операция в периоде датируется концом недели (ends_on)'
);

select is(
  (select posted_on from fp_postings('11111111-1111-1111-1111-111111111111') where comment = 'pgtap: внепериодная' limit 1),
  date '2026-07-03',
  'внепериодная операция датируется датой создания (Душанбе), а не концом недели'
);

select * from finish();
rollback;
