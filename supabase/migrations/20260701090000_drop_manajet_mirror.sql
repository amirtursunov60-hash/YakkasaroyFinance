-- ============================================================================
--  Демонтаж интеграции ManaJet (01.07.2026, решение заказчика): зеркало mj_*
--  и вся обвязка синхронизации удаляются полностью. Операционный финконтур
--  (funds, incomes, fp_register, statistics и т.д.) НЕ затрагивается:
--  импортированные ранее справочники — рабочие данные системы, колонка
--  outer_id остаётся соглашением схемы для будущих интеграций (iiko).
--
--  Состав:
--   1) снять cron-джобы ночной синхронизации (pg_cron);
--   2) удалить функцию mj_cron_sync (вызывала Edge Function manajet-sync);
--   3) mj_secret → app_secret: чтение секретов Vault нужно не только
--      интеграции — request-ai-review читает anthropic_api_key/anthropic_model/
--      ai_review_prompt. Переименовываем в нейтральное имя, права те же
--      (EXECUTE только service_role);
--   4) удалить 12 зеркальных read-only таблиц mj_* вместе с данными.
--  Секреты Vault manajet_auth / mj_cron_secret удаляются отдельно через
--  execute_sql (данные Vault, не DDL) — как и создавались.
-- ============================================================================

-- 1) cron-джобы синхронизации ManaJet
do $$
declare
  j record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for j in
      select jobname from cron.job where jobname in
        ('mj_sync_refs', 'mj_sync_po', 'mj_sync_bills', 'mj_sync_invoices',
         'mj_sync_incomes', 'mj_sync_statvalues', 'mj_import_refs')
    loop
      perform cron.unschedule(j.jobname);
    end loop;
  end if;
end $$;

-- 2) функция ночного синка (дёргала manajet-sync через pg_net)
drop function if exists public.mj_cron_sync(text[]);

-- 3) общий читатель Vault для Edge Functions: app_secret вместо mj_secret
create or replace function public.app_secret(p_name text)
returns text
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function public.app_secret(text) from public, anon, authenticated;
grant execute on function public.app_secret(text) to service_role;
comment on function public.app_secret(text) is
  'Чтение секрета Vault по имени. EXECUTE только service_role — вызывают Edge Functions (request-ai-review).';

drop function if exists public.mj_secret(text);

-- 4) зеркальные таблицы mj_* (вместе с RLS-политиками и данными)
drop table if exists public.mj_stat_values;
drop table if exists public.mj_stats;
drop table if exists public.mj_purchase_orders;
drop table if exists public.mj_bills;
drop table if exists public.mj_invoices;
drop table if exists public.mj_incomes;
drop table if exists public.mj_periods;
drop table if exists public.mj_funds;
drop table if exists public.mj_positions;
drop table if exists public.mj_persons;
drop table if exists public.mj_companies;
drop table if exists public.mj_sync_log;
