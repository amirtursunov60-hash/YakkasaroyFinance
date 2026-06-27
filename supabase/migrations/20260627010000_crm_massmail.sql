-- Рассылки клиентам (Massmail, gap-map CRM/Задачи §12). SMS/email-шлюза нет —
-- рассылка = сегмент клиентов/лидов → снимок получателей (имя+телефон) с
-- WhatsApp-ссылками и копируемым списком + история кампаний и отметка «отправлено».
-- RLS — родной CRM-паттерн (по точке: финадмин / сетевая / has_location_access).

create table if not exists public.massmail_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  template_text text,                 -- текст сообщения, макрос {name}
  segment_type text not null,         -- 'clients' | 'leads'
  segment_filters jsonb,              -- {tag, event_type, source} — для истории
  location_id uuid references public.locations(id),  -- null = сетевая
  is_archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists massmail_campaigns_loc_idx on public.massmail_campaigns(location_id, is_archived);

create table if not exists public.massmail_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.massmail_campaigns(id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null,
  source_type text not null,          -- 'client' | 'lead'
  source_id uuid,                     -- id клиента/лида (трекинг)
  note text,                          -- контекст (тип события/дата)
  is_sent boolean not null default false,
  sent_at timestamptz
);
create index if not exists massmail_recipients_campaign_idx on public.massmail_recipients(campaign_id);

alter table public.massmail_campaigns enable row level security;
alter table public.massmail_recipients enable row level security;

-- campaigns: видно по точке (как crm_clients); пишет финадмин или доступ к точке
drop policy if exists mmcamp_read on public.massmail_campaigns;
create policy mmcamp_read on public.massmail_campaigns as permissive for select to public
  using (is_fin_admin() or location_id is null or has_location_access(location_id));
drop policy if exists mmcamp_insert on public.massmail_campaigns;
create policy mmcamp_insert on public.massmail_campaigns as permissive for insert to public
  with check (is_fin_admin() or location_id is null or has_location_access(location_id));
drop policy if exists mmcamp_update on public.massmail_campaigns;
create policy mmcamp_update on public.massmail_campaigns as permissive for update to public
  using (is_fin_admin() or location_id is null or has_location_access(location_id))
  with check (is_fin_admin() or location_id is null or has_location_access(location_id));
grant select, insert, update on public.massmail_campaigns to authenticated;

-- recipients: доступ наследуется от видимости кампании (EXISTS-on-parent)
drop policy if exists mmrecip_read on public.massmail_recipients;
create policy mmrecip_read on public.massmail_recipients as permissive for select to public
  using (exists (select 1 from public.massmail_campaigns c
    where c.id = massmail_recipients.campaign_id
      and (is_fin_admin() or c.location_id is null or has_location_access(c.location_id))));
drop policy if exists mmrecip_insert on public.massmail_recipients;
create policy mmrecip_insert on public.massmail_recipients as permissive for insert to public
  with check (exists (select 1 from public.massmail_campaigns c
    where c.id = massmail_recipients.campaign_id
      and (is_fin_admin() or c.location_id is null or has_location_access(c.location_id))));
drop policy if exists mmrecip_update on public.massmail_recipients;
create policy mmrecip_update on public.massmail_recipients as permissive for update to public
  using (exists (select 1 from public.massmail_campaigns c
    where c.id = massmail_recipients.campaign_id
      and (is_fin_admin() or c.location_id is null or has_location_access(c.location_id))))
  with check (exists (select 1 from public.massmail_campaigns c
    where c.id = massmail_recipients.campaign_id
      and (is_fin_admin() or c.location_id is null or has_location_access(c.location_id))));
grant select, insert, update on public.massmail_recipients to authenticated;
