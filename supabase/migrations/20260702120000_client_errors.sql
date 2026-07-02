-- Журнал ошибок фронта (client_errors) — мониторинг без внешнего сервиса
-- (ADR-0009): ошибки рендера/необработанные исключения у пользователей пишутся
-- в БД best-effort из src/lib/monitoring.ts (лимит на сессию — на клиенте),
-- просмотр — финадминам в «Журнал аудита» → «Ошибки фронта». Sentry остаётся
-- опциональным каналом (VITE_SENTRY_DSN), оба работают параллельно.
-- Идемпотентно.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(message) <= 2000),
  stack text check (stack is null or char_length(stack) <= 8000),
  component_stack text check (component_stack is null or char_length(component_stack) <= 8000),
  url text check (url is null or char_length(url) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  is_archived boolean not null default false
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_profile_id_idx on public.client_errors (profile_id);

alter table public.client_errors enable row level security;

-- Запись — любой вошедший пользователь, только от своего имени (или анонимно null)
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to authenticated
  with check (profile_id is null or profile_id = auth.uid());

-- Чтение и архивирование — только финадмины
drop policy if exists client_errors_read on public.client_errors;
create policy client_errors_read on public.client_errors
  for select to authenticated using (public.is_fin_admin());

drop policy if exists client_errors_update on public.client_errors;
create policy client_errors_update on public.client_errors
  for update to authenticated
  using (public.is_fin_admin()) with check (public.is_fin_admin());
