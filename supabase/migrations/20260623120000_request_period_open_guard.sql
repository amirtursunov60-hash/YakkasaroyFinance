-- Запрет подачи заявки-ЗРС на закрытую неделю ФП (правило Директивы: операции в
-- закрытом периоде запрещены — принцип ТЗ v2 §4). На уровне UI закрытые недели
-- уже исключены из выбора, но инвариант должен держать БД: триггер BEFORE INSERT
-- на payment_requests не даёт вставить заявку с period_id закрытого периода
-- (минуя интерфейс — например, прямым вызовом API).
--
-- Только на INSERT (подача новой заявки). Решения финкомитета (одобрение/отклонение/
-- оплата) — это UPDATE и проводятся в текущем открытом периоде, их не трогаем.
-- period_id у заявки nullable — если не задан, проверку пропускаем.

create or replace function public.trg_request_period_open_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if new.period_id is not null then
    select status into v_status from fp_periods where id = new.period_id;
    if v_status = 'closed' then
      raise exception 'Неделя ФП закрыта — подача заявки на закрытый период запрещена'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists request_period_open_check on public.payment_requests;
create trigger request_period_open_check
  before insert on public.payment_requests
  for each row execute function public.trg_request_period_open_check();
