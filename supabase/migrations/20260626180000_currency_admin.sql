-- CRUD валют и курсов обмена из UI (gap-map Фонды §3, §4). Раньше:
-- currencies — только read; exchange_rates — read + insert (финадмин/бухгалтер).
-- Добавляем недостающие write-политики для управления справочником финадмином.
-- Расчёты конвертации (findRate, amount_base, fx_rate) НЕ трогаем.

-- ── Валюты: добавление и правка (имя/код). Удаление НЕ даём — валюта ссылается
-- из счетов/фондов/операций; вывод из оборота — отдельная задача (нет is_archived).
drop policy if exists currencies_insert on public.currencies;
create policy currencies_insert on public.currencies as permissive for insert to public
  with check (is_fin_admin());
drop policy if exists currencies_update on public.currencies;
create policy currencies_update on public.currencies as permissive for update to public
  using (is_fin_admin()) with check (is_fin_admin());
grant insert, update on public.currencies to authenticated;

-- ── Курсы: правка и удаление ошибочных (insert уже был — rates_insert).
drop policy if exists rates_update on public.exchange_rates;
create policy rates_update on public.exchange_rates as permissive for update to public
  using (is_fin_admin()) with check (is_fin_admin());
drop policy if exists rates_delete on public.exchange_rates;
create policy rates_delete on public.exchange_rates as permissive for delete to public
  using (is_fin_admin());
grant update, delete on public.exchange_rates to authenticated;

-- ── Атомарная смена базовой валюты: ровно одна is_base=true. Меняет толкование
-- amount_base, поэтому отдельной осознанной операцией финадмина (с подтверждением в UI).
create or replace function public.fp_set_base_currency(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_fin_admin() then
    raise exception 'Недостаточно прав для смены базовой валюты';
  end if;
  if not exists (select 1 from public.currencies where id = p_id) then
    raise exception 'Валюта не найдена';
  end if;
  update public.currencies set is_base = (id = p_id);
end $$;
grant execute on function public.fp_set_base_currency(uuid) to authenticated;
