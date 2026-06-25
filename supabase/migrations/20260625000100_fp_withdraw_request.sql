-- Заявки §7: RPC отзыва собственной заявки заявителем.
-- (Продолжение 20260625000000_request_status_withdrawn.sql — здесь уже можно
-- использовать значение enum 'withdrawn'.)
--
-- Почему RPC, а не прямой UPDATE под RLS: политика requests_update требует,
-- чтобы И старая, И новая строка удовлетворяли USING (для заявителя —
-- status = 'submitted'). Перевод в 'withdrawn' меняет статус, поэтому новая
-- строка USING не проходит и прямой UPDATE заявителем был бы отклонён.
-- SECURITY DEFINER-функция выполняет перевод сама, проверяя инварианты:
--   • отзывает только владелец заявки (requester_id = auth.uid());
--   • только пока заявка «подана» (submitted) — до решения финкомитета.
-- Триггер-страж периода (request_period_open_check) не мешает: он реагирует
-- лишь на смену period_id, а здесь меняется только status.

create or replace function public.fp_withdraw_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_status    request_status;
begin
  select requester_id, status
    into v_requester, v_status
    from public.payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Заявка не найдена';
  end if;

  if v_requester is distinct from (select auth.uid()) then
    raise exception 'Отозвать можно только свою заявку';
  end if;

  if v_status <> 'submitted'::request_status then
    raise exception 'Отозвать можно только заявку на рассмотрении (статус «подана»)';
  end if;

  update public.payment_requests
     set status = 'withdrawn'::request_status
   where id = p_request_id;
end;
$$;

revoke all on function public.fp_withdraw_request(uuid) from public, anon;
grant execute on function public.fp_withdraw_request(uuid) to authenticated;
