-- ============================================================================
-- pgTAP · Аватар сотрудника
-- Запуск: supabase test db (на ветке/staging) либо pg_prove. Только структурные
-- проверки — ничего не пишут.
-- ============================================================================
begin;
select plan(2);
set search_path = extensions, public;

select has_column('public', 'profiles', 'avatar_url', 'profiles.avatar_url есть');
select ok(exists(select 1 from storage.buckets where id = 'avatars' and public),
  'публичный бакет avatars существует');

select * from finish();
rollback;
