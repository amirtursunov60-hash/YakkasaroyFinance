-- ============================================================================
-- Форма заявки на расход (ЗРС) по шаблону ManaJet (раздел «Расходы»):
-- короткая «Цель расхода» (purpose) и «Метки» (tags). Период «К рассмотрению
-- на ФП» использует существующую колонку payment_requests.period_id.
--
-- RLS уже задан в baseline (read_all + admin/заявитель write) — новые колонки
-- наследуют существующие политики.
-- ============================================================================

alter table public.payment_requests add column if not exists purpose text;
alter table public.payment_requests add column if not exists tags text[] not null default '{}'::text[];
