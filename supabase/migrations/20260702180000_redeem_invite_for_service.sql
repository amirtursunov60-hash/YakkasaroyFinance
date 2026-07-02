-- Регистрация по приглашению без письма-подтверждения.
--
-- Причина: включённое «Confirm email» + дефолтный Site URL (localhost) + выедание
-- одноразового токена /verify предзагрузкой почтовых сканеров (Gmail) приводили к
-- ошибке «Email link is invalid or has expired» у сотрудников. Доступ к регистрации
-- и так защищён одноразовой ссылкой-приглашением (invites), поэтому подтверждение
-- почты — лишний ломающийся шаг.
--
-- Решение: серверная функция (Edge Function invite-register) под service_role
-- создаёт пользователя уже подтверждённым и применяет приглашение через эту RPC.
-- Функция — «серверный» вариант redeem_invite: принимает id пользователя явно
-- (у service_role нет auth.uid()) и доступна ТОЛЬКО service_role.

create or replace function public.redeem_invite_for(p_user uuid, p_token text, p_full_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites%rowtype;
begin
  if p_user is null then
    raise exception 'Не указан пользователь';
  end if;

  -- FOR UPDATE: блокируем строку приглашения, чтобы два параллельных приёма
  -- одного токена не прошли оба (второй увидит used_by и получит отказ).
  select * into inv from invites where token = p_token for update;
  if inv.id is null then raise exception 'Приглашение не найдено'; end if;
  if inv.used_by is not null then raise exception 'Приглашение уже использовано'; end if;
  if inv.expires_at < now() then raise exception 'Срок действия приглашения истёк'; end if;

  insert into profiles (id, full_name, role)
  values (p_user, coalesce(nullif(trim(p_full_name), ''), 'Сотрудник'), inv.role)
  on conflict (id) do update set role = excluded.role;

  if inv.location_id is not null then
    insert into user_location_access (user_id, location_id)
    values (p_user, inv.location_id)
    on conflict do nothing;
  end if;

  if inv.position_id is not null then
    insert into position_assignments (person_id, position_id, is_main)
    values (p_user, inv.position_id, true)
    on conflict do nothing;
  end if;

  update invites set used_by = p_user, used_at = now() where id = inv.id;
end $$;

-- Только сервер (Edge Function под service_role). Клиентам (anon/authenticated)
-- недоступно — иначе можно было бы применить приглашение на чужой uid.
revoke execute on function public.redeem_invite_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_invite_for(uuid, text, text) to service_role;
