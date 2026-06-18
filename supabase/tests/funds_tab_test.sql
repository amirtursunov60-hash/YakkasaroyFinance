-- ============================================================================
-- pgTAP · Вкладка «Фонды»: новые поля фонда, ручные операции, режимы
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные/read-only проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(18);

set search_path = extensions, public;

-- --- Новые поля фонда (docs/funds-spec.md §10) ----------------------------
select has_column('public', 'funds', 'description', 'funds.description есть');
select has_column('public', 'funds', 'color', 'funds.color (цвет-метка) есть');
select has_column('public', 'funds', 'stage', 'funds.stage (этап) есть');
select has_column('public', 'funds', 'no_transfer', 'funds.no_transfer (запрет перемещения) есть');
select has_column('public', 'funds', 'is_private', 'funds.is_private (приватный) есть');
select col_type_is('public', 'funds', 'stage', 'distribution_stage', 'funds.stage — enum distribution_stage');

-- --- Типы операций Реестра -------------------------------------------------
select ok((select 'fund_income' = any(enum_range(null::register_op_type)::text[])),
  'register_op_type содержит fund_income');
select ok((select 'fund_return' = any(enum_range(null::register_op_type)::text[])),
  'register_op_type содержит fund_return');

-- --- Ручные операции фонда -------------------------------------------------
select has_function('public', 'fp_fund_income', 'функция прихода в фонд есть');
select has_function('public', 'fp_fund_return', 'функция возврата из фонда есть');
select has_function('public', 'fp_set_fund_stage', 'функция синхронизации этапа фонда с Директивой есть');
select has_function('public', 'fp_reverse_fund_op', 'функция отката операции фонда есть');
select has_column('public', 'fp_register', 'reverses_id', 'fp_register.reverses_id (ссылка на откатываемую строку) есть');
select ok((select count(*) = 1 from pg_trigger where tgname = 'request_approve_funds_check'),
  'триггер запрета одобрения заявки сверх Доступно включён');
select ok((select count(*) = 1 from pg_trigger where tgname = 'bill_approve_funds_check'),
  'триггер запрета одобрения счёта сверх Доступно включён');

-- --- Защита режимов в существующих RPC ------------------------------------
select ok(position('accumulative' in pg_get_functiondef('public.fp_pay_request'::regproc)) > 0,
  'fp_pay_request запрещает накопительный фонд');
select ok(position('accumulative' in pg_get_functiondef('public.fp_pay_bill'::regproc)) > 0,
  'fp_pay_bill запрещает накопительный фонд');

-- --- Анти-регресс: оплата заявки по одобренной сумме сохранена ------------
select ok(position('approved_amount' in pg_get_functiondef('public.fp_pay_request'::regproc)) > 0,
  'fp_pay_request оплачивает coalesce(approved_amount, planned_amount)');

select * from finish();
rollback;
