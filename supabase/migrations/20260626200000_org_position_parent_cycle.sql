-- Дерево постов оргсхемы (gap-map Оргсхема/Стат §10). Колонка
-- org_positions.parent_id (self-FK) уже есть в baseline; задействуем в UI.
-- Здесь — только защита целостности: триггер, запрещающий цикл в иерархии
-- (пост не может быть сам себе предком). RLS/колонки не меняем.

create or replace function public.trg_org_position_no_cycle()
returns trigger language plpgsql as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'Пост не может быть подчинён сам себе';
  end if;
  -- Поднимаемся по цепочке руководителей от нового родителя вверх:
  -- если встретим сам пост — образовался бы цикл.
  if exists (
    with recursive anc as (
      select id, parent_id from public.org_positions where id = new.parent_id
      union all
      select o.id, o.parent_id from public.org_positions o join anc on o.id = anc.parent_id
    )
    select 1 from anc where id = new.id
  ) then
    raise exception 'Циклическая ссылка в иерархии постов (пост стал бы своим предком)';
  end if;
  return new;
end $$;

drop trigger if exists org_position_no_cycle on public.org_positions;
create trigger org_position_no_cycle
  before insert or update of parent_id on public.org_positions
  for each row execute function public.trg_org_position_no_cycle();
