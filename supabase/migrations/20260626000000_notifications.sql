-- In-app уведомления (Задачи §12 gap-map). Лента личных уведомлений: новый
-- комментарий по заявке (в т.ч. ответ Финансового директора) и решение по
-- заявке (одобрена/отклонена/возвращена/оплачена). Наполняется триггерами БД
-- (централизованно, без правки edge-функции). Insert — только через
-- SECURITY DEFINER-триггеры; пользователь видит и помечает прочитанными только свои.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,                 -- 'request_comment' | 'request_decision'
  title text not null,
  body text,
  module text,                        -- куда вести по клику (напр. 'finance')
  view_key text,                      -- раздел (напр. 'requests')
  request_id uuid,                    -- контекст
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
create policy notif_read on public.notifications as permissive for select to public
  using (user_id = (select auth.uid()));
create policy notif_update on public.notifications as permissive for update to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, update on public.notifications to authenticated;

-- Уведомление о новом комментарии по заявке (ответ финдира или чужой коммент).
create or replace function public.trg_notify_request_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select id, number, requester_id into r from public.payment_requests where id = new.request_id;
  if not found or r.requester_id is null then return new; end if;
  -- не уведомляем автора о его же комментарии
  if new.author_id is not null and new.author_id = r.requester_id then return new; end if;
  insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
  values (r.requester_id, 'request_comment',
    case when new.is_ai then 'Финансовый директор ответил по заявке №' || r.number
         else 'Новый комментарий по заявке №' || r.number end,
    left(coalesce(new.body, ''), 140), 'finance', 'requests', r.id);
  return new;
end $$;
drop trigger if exists notify_request_comment on public.request_comments;
create trigger notify_request_comment after insert on public.request_comments
  for each row execute function public.trg_notify_request_comment();

-- Уведомление о решении по заявке (смена статуса финкомитетом).
create or replace function public.trg_notify_request_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and new.status = any (array['approved','rejected','revision','paid']::request_status[])
     and new.requester_id is not null then
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (new.requester_id, 'request_decision',
      'Заявка №' || new.number || ': ' ||
        case new.status
          when 'approved' then 'одобрена'
          when 'rejected' then 'отклонена'
          when 'revision' then 'возвращена на доработку'
          when 'paid' then 'оплачена'
          else new.status::text end,
      new.rejection_reason, 'finance', 'requests', new.id);
  end if;
  return new;
end $$;
drop trigger if exists notify_request_decision on public.payment_requests;
create trigger notify_request_decision after update of status on public.payment_requests
  for each row execute function public.trg_notify_request_decision();
