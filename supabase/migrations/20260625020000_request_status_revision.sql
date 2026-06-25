-- Заявки §8: статус «на доработке» (revision) — финкомитет возвращает заявку
-- автору на правку с причиной (≠ отклонение). Автор правит ЗРС и подаёт заново.
--
-- Как и с 'withdrawn', новое значение enum нельзя использовать в той же
-- транзакции, где оно добавлено — поэтому ADD VALUE отдельной миграцией, а
-- политика, ссылающаяся на 'revision' — в следующей
-- (20260625020100_request_revision_policy.sql).
--
-- request_status — общий enum (payment_requests/supplier_bills/payroll_sheets);
-- добавление значения безопасно, существующие строки/политики не затрагиваются.

alter type public.request_status add value if not exists 'revision';
