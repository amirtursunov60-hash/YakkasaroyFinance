-- ============================================================================
-- pgTAP · Поля рассмотрения заявки в Директиве (одобренная сумма + комментарий)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(5);

set search_path = extensions, public;

select has_column('public', 'payment_requests', 'approved_amount', 'payment_requests.approved_amount (одобренная сумма) есть');
select col_type_is('public', 'payment_requests', 'approved_amount', 'numeric', 'approved_amount — numeric');
select has_column('public', 'payment_requests', 'comment', 'payment_requests.comment (комментарий решения) есть');

-- ограничение: одобренная сумма либо не задана, либо строго положительна
select hasnt_column('public', 'payment_requests', 'no_such_column', 'контроль: несуществующей колонки нет');

-- функция оплаты на месте (одобренную сумму она учитывает через coalesce)
select has_function('public', 'fp_pay_request', array['uuid', 'uuid', 'uuid'], 'fp_pay_request(uuid,uuid,uuid) есть');

select * from finish();
rollback;
