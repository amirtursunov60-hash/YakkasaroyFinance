-- Расширение стража закрытой недели (20260623120000) на UPDATE: теперь нельзя не
-- только ПОДАТЬ заявку на закрытый период, но и ПЕРЕНЕСТИ существующую заявку в
-- закрытую неделю (редактор заявки во вкладке «Заявки» меняет period_id).
--
-- Срабатывает на INSERT и на UPDATE, но только когда period_id реально указывает
-- на закрытый период И при этом меняется (или это вставка). Прочие правки заявки,
-- не трогающие неделю, проходят свободно — даже если сама заявка лежит в неделе,
-- которую закрыли. Решения финкомитета (одобрение/оплата) period_id в закрытую
-- неделю не переводят, поэтому их не блокирует.

create or replace function public.trg_request_period_open_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if new.period_id is not null
     and (tg_op = 'INSERT' or new.period_id is distinct from old.period_id) then
    select status into v_status from fp_periods where id = new.period_id;
    if v_status = 'closed' then
      raise exception 'Неделя ФП закрыта — нельзя подать или перенести заявку в закрытый период'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists request_period_open_check on public.payment_requests;
create trigger request_period_open_check
  before insert or update on public.payment_requests
  for each row execute function public.trg_request_period_open_check();
