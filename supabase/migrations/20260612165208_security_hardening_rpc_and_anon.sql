-- Устранение находок security advisor (2026-06-12):
-- 1) NULL-безопасные проверки ролей: у anon auth.uid() пуст, my_role() даёт NULL,
--    и условие "if not is_fin_admin()" молча пропускало выполнение дальше.
-- 2) Фиксированный search_path для всех SECURITY DEFINER / триггерных функций.
-- 3) Отзыв EXECUTE у anon/PUBLIC на RPC-функции; триггерные функции недоступны никому.
-- 4) Полный отзыв прав anon на таблицы: приложение работает только после входа.

-- ---------- 1+2. Хелперы: NULL-безопасность + search_path ----------
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select role from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_fin_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select coalesce(public.my_role() in ('owner', 'fin_director'), false);
$function$;

CREATE OR REPLACE FUNCTION public.has_fund_access(f uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select coalesce(
      public.is_fin_admin()
      or exists (select 1 from public.funds where id = f and not is_restricted)
      or exists (select 1 from public.fund_access
                 where user_id = auth.uid() and fund_id = f)
  , false);
$function$;

CREATE OR REPLACE FUNCTION public.has_location_access(loc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select coalesce(
      public.is_fin_admin()
      or public.my_role() = 'ops_director'
      or exists (select 1 from public.user_location_access
                 where user_id = auth.uid() and location_id = loc)
  , false);
$function$;

CREATE OR REPLACE FUNCTION public.holds_position(pos uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select exists (select 1 from public.position_assignments
                 where person_id = auth.uid() and position_id = pos);
$function$;

-- ---------- 2. search_path для триггерных функций ----------
alter function public.trg_audit() set search_path = public;
alter function public.trg_income_to_register() set search_path = public;
alter function public.trg_register_balances() set search_path = public;
alter function public.trg_register_no_overdraft() set search_path = public;
alter function public.trg_register_period_lock() set search_path = public;

-- ---------- 3. Права на выполнение функций ----------
-- RPC-функции: только для залогиненных (внутри них проверяется роль) и service_role
revoke execute on function public.fp_close_period(uuid, jsonb) from public, anon;
revoke execute on function public.fp_distribute_stage(uuid, text, jsonb) from public, anon;
revoke execute on function public.fp_reopen_period(uuid) from public, anon;
revoke execute on function public.fp_reset_distribution(uuid, text) from public, anon;
grant execute on function public.fp_close_period(uuid, jsonb) to authenticated, service_role;
grant execute on function public.fp_distribute_stage(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.fp_reopen_period(uuid) to authenticated, service_role;
grant execute on function public.fp_reset_distribution(uuid, text) to authenticated, service_role;

-- Хелперы: нужны RLS-политикам, выполняющимся от имени authenticated
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_fin_admin() from public, anon;
revoke execute on function public.has_fund_access(uuid) from public, anon;
revoke execute on function public.has_location_access(uuid) from public, anon;
revoke execute on function public.holds_position(uuid) from public, anon;
grant execute on function public.my_role() to authenticated, service_role;
grant execute on function public.is_fin_admin() to authenticated, service_role;
grant execute on function public.has_fund_access(uuid) to authenticated, service_role;
grant execute on function public.has_location_access(uuid) to authenticated, service_role;
grant execute on function public.holds_position(uuid) to authenticated, service_role;

-- Триггерные функции: вызываются только триггерами, EXECUTE не нужен никому
revoke execute on function public.trg_audit() from public, anon, authenticated;
revoke execute on function public.trg_income_to_register() from public, anon, authenticated;
revoke execute on function public.trg_register_balances() from public, anon, authenticated;
revoke execute on function public.trg_register_no_overdraft() from public, anon, authenticated;
revoke execute on function public.trg_register_period_lock() from public, anon, authenticated;

-- ---------- 4. Анонимный доступ к данным закрыт полностью ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
