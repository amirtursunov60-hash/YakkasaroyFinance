-- ============================================================================
-- 003 · Чистка после миграций 001–002
-- В базе уже существовала полная схема v2, созданная вручную (вне git).
-- Миграции 001–002 применились поверх неё и оставили дубли политик и
-- сломанную функцию; прежние файлы 003_finance.sql / 004_seed.sql не
-- применились вовсе (откатились) и удалены из репозитория.
-- Этот файл удаляет ТОЛЬКО объекты, созданные файлами 001–002, —
-- родные политики базовой схемы (read_all, ca_read, admin_write и т.д.)
-- не затрагиваются.
-- ============================================================================

-- Дубли политик из 001 (у базовой схемы на profiles свои: read_all,
-- profiles_insert, profiles_self)
drop policy if exists profiles_select     on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

-- Дубли политик из 002. cash_accounts_read (using true) ослаблял
-- родное ограничение видимости касс по точкам (ca_read) — удалить обязательно.
drop policy if exists locations_read      on public.locations;
drop policy if exists locations_write     on public.locations;
drop policy if exists currencies_read     on public.currencies;
drop policy if exists currencies_write    on public.currencies;
drop policy if exists payment_types_read  on public.payment_types;
drop policy if exists payment_types_write on public.payment_types;
drop policy if exists fp_periods_read     on public.fp_periods;
drop policy if exists fp_periods_write    on public.fp_periods;
drop policy if exists cash_accounts_read  on public.cash_accounts;
drop policy if exists cash_accounts_write on public.cash_accounts;

-- Функции из 001–002 (политики выше — единственное, что на них ссылалось):
-- ensure_fp_period обращается к колонке date_start, которой нет (в базе
-- starts_on) — функция нерабочая; app_role()/is_fin() дублируют родные
-- my_role()/is_fin_admin().
drop function if exists public.ensure_fp_period(date);
drop function if exists public.is_fin();
drop function if exists public.app_role();
