-- ============================================================================
-- pgTAP · Поля формы заявки (ЗРС) по шаблону ManaJet
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(4);

set search_path = extensions, public;

select has_column('public', 'payment_requests', 'purpose', 'payment_requests.purpose (цель расхода) есть');
select has_column('public', 'payment_requests', 'tags', 'payment_requests.tags (метки) есть');
select col_type_is('public', 'payment_requests', 'tags', 'text[]', 'tags — массив text[]');
select col_not_null('public', 'payment_requests', 'tags', 'tags — NOT NULL (default {})');

select * from finish();
rollback;
