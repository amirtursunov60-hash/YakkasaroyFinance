-- Индексы на внешние ключи (advisor: unindexed_foreign_keys).
-- Создаются только практически полезные: джойны, деревья parent_id,
-- колонки из RLS-подзапросов. FK, уже покрытые ведущей колонкой
-- составного/уникального индекса, пропущены.

create index if not exists audit_log_user_id_idx on public.audit_log (user_id);

create index if not exists cash_account_folders_parent_id_idx on public.cash_account_folders (parent_id);
create index if not exists cash_accounts_location_id_idx on public.cash_accounts (location_id);
create index if not exists cash_accounts_currency_id_idx on public.cash_accounts (currency_id);
create index if not exists cash_accounts_folder_id_idx on public.cash_accounts (folder_id);

create index if not exists distribution_rules_income_type_id_idx on public.distribution_rules (income_type_id);

create index if not exists exchange_rates_to_cur_id_idx on public.exchange_rates (to_cur_id);

create index if not exists expense_type_access_expense_type_id_idx on public.expense_type_access (expense_type_id);
create index if not exists expense_types_parent_id_idx on public.expense_types (parent_id);
create index if not exists expense_types_location_id_idx on public.expense_types (location_id);

create index if not exists fp_register_income_id_idx on public.fp_register (income_id);
create index if not exists fp_register_counterparty_id_idx on public.fp_register (counterparty_id);
create index if not exists fp_register_created_by_idx on public.fp_register (created_by);
create index if not exists fp_register_loan_parent_id_idx on public.fp_register (loan_parent_id);

create index if not exists fund_access_fund_id_idx on public.fund_access (fund_id);
create index if not exists fund_folders_parent_id_idx on public.fund_folders (parent_id);
create index if not exists funds_location_id_idx on public.funds (location_id);
create index if not exists funds_folder_id_idx on public.funds (folder_id);

create index if not exists income_types_parent_id_idx on public.income_types (parent_id);
create index if not exists income_types_location_id_idx on public.income_types (location_id);

create index if not exists incomes_income_type_id_idx on public.incomes (income_type_id);
create index if not exists incomes_counterparty_id_idx on public.incomes (counterparty_id);
create index if not exists incomes_created_by_idx on public.incomes (created_by);

create index if not exists org_positions_location_id_idx on public.org_positions (location_id);
create index if not exists org_positions_parent_id_idx on public.org_positions (parent_id);

create index if not exists payment_requests_requester_id_idx on public.payment_requests (requester_id);
create index if not exists payment_requests_expense_type_id_idx on public.payment_requests (expense_type_id);
create index if not exists payment_requests_fund_id_idx on public.payment_requests (fund_id);
create index if not exists payment_requests_counterparty_id_idx on public.payment_requests (counterparty_id);

create index if not exists period_distribution_overrides_rule_id_idx on public.period_distribution_overrides (rule_id);
create index if not exists position_assignments_position_id_idx on public.position_assignments (position_id);
create index if not exists reconciliations_period_id_idx on public.reconciliations (period_id);
create index if not exists request_attachments_request_id_idx on public.request_attachments (request_id);
create index if not exists request_comments_request_id_idx on public.request_comments (request_id);
create index if not exists statistic_values_period_id_idx on public.statistic_values (period_id);

create index if not exists statistics_location_id_idx on public.statistics (location_id);
create index if not exists statistics_owner_id_idx on public.statistics (owner_id);
create index if not exists statistics_position_id_idx on public.statistics (position_id);

create index if not exists user_location_access_location_id_idx on public.user_location_access (location_id);
