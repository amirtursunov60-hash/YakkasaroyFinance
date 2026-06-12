-- Модуль «Сотрудники»: приём приглашения по ссылке + устранение дыр в правах.
-- Дыры: profiles_insert/profiles_self позволяли пользователю самому назначить
-- себе любую роль (включая owner) при создании/обновлении своего профиля.

-- 1) Самостоятельная регистрация профиля — только с ролью employee
drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (
    (select is_fin_admin())
    or (id = (select auth.uid()) and role = 'employee'::app_role)
  );

-- 2) Самостоятельное обновление — без смены роли и is_active
drop policy profiles_self on public.profiles;
create policy profiles_self on public.profiles for update
  using ((id = (select auth.uid())) or (select is_fin_admin()))
  with check (
    (select is_fin_admin())
    or (
      id = (select auth.uid())
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
      and is_active = (select p.is_active from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- 3) Приём приглашения: создаёт/обновляет профиль с ролью из инвайта,
--    выдаёт доступ к точке и назначает пост, помечает инвайт использованным
create or replace function public.redeem_invite(p_token text, p_full_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Требуется вход в систему';
  end if;

  select * into inv from invites where token = p_token;
  if inv.id is null then raise exception 'Приглашение не найдено'; end if;
  if inv.used_by is not null then raise exception 'Приглашение уже использовано'; end if;
  if inv.expires_at < now() then raise exception 'Срок действия приглашения истёк'; end if;

  insert into profiles (id, full_name, role)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Сотрудник'), inv.role)
  on conflict (id) do update set role = excluded.role;

  if inv.location_id is not null then
    insert into user_location_access (user_id, location_id)
    values (auth.uid(), inv.location_id)
    on conflict do nothing;
  end if;

  if inv.position_id is not null then
    insert into position_assignments (person_id, position_id, is_main)
    values (auth.uid(), inv.position_id, true)
    on conflict do nothing;
  end if;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;
end $$;

revoke execute on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated, service_role;
