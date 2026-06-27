-- Напоминания-события по срокам (gap-map Задачи/CRM §10). Дедлайны уже есть
-- (tasks.due_date, crm_leads.due_date) — не хватало самих напоминаний. RPC
-- fp_generate_due_reminders() создаёт записи в notifications (лента колокольчика
-- из #185) по просроченным/сегодняшним задачам и лидам ВЫЗЫВАЮЩЕГО пользователя.
-- Идемпотентно: пока существует непрочитанное напоминание по сущности — дубликат
-- не создаётся. Вызывается клиентом при входе (api.generateDueReminders).

create or replace function public.fp_generate_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
  cnt integer := 0;
  today date := (now() at time zone 'Asia/Dushanbe')::date;  -- «сегодня» по местному времени
  r record;
begin
  if me is null then return 0; end if;

  -- Задачи, назначенные мне: срок сегодня или просрочен, не выполнены/в архиве
  for r in
    select t.id, t.title, t.due_date
    from public.tasks t
    where t.to_id = me
      and t.status <> 'done'::task_status
      and t.is_archived = false
      and t.due_date is not null
      and t.due_date <= today
      and not exists (
        select 1 from public.notifications n
        where n.user_id = me and n.kind = 'reminder' and n.request_id = t.id and n.is_read = false
      )
  loop
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (me, 'reminder',
      case when r.due_date < today then 'Просрочена задача: ' || r.title
           else 'Сегодня срок задачи: ' || r.title end,
      'Срок: ' || to_char(r.due_date, 'DD.MM.YYYY'),
      'dashboard', 'd_tasks', r.id);
    cnt := cnt + 1;
  end loop;

  -- Лиды, где я ответственный: срок сегодня/просрочен, активная стадия (не won/lost)
  for r in
    select l.id, l.name, l.due_date
    from public.crm_leads l
    left join public.crm_stages s on s.id = l.stage_id
    where l.responsible_id = me
      and l.due_date is not null
      and l.due_date <= today
      and coalesce(s.is_won, false) = false
      and coalesce(s.is_lost, false) = false
      and not exists (
        select 1 from public.notifications n
        where n.user_id = me and n.kind = 'reminder' and n.request_id = l.id and n.is_read = false
      )
  loop
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (me, 'reminder',
      case when r.due_date < today then 'Просрочен лид: ' || coalesce(r.name, 'без имени')
           else 'Сегодня по лиду: ' || coalesce(r.name, 'без имени') end,
      'Следующий шаг: ' || to_char(r.due_date, 'DD.MM.YYYY'),
      'crm', 'c_funnel', r.id);
    cnt := cnt + 1;
  end loop;

  return cnt;
end $$;

grant execute on function public.fp_generate_due_reminders() to authenticated;
