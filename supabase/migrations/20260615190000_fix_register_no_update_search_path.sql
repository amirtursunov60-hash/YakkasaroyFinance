-- ============================================================================
-- Фикс линтера безопасности (advisors: function_search_path_mutable).
-- У триггерной функции trg_register_no_update не был зафиксирован search_path.
-- Функция только бросает исключение (к таблицам не обращается), риска нет, но
-- стабильный search_path — правильная гигиена для security-чувствительного кода.
-- ============================================================================

create or replace function public.trg_register_no_update()
 returns trigger
 language plpgsql
 set search_path = public
as $$
begin
  raise exception 'Реестр fp_register неизменяем: коррекция — только встречной проводкой или сбросом (reset)';
end $$;
