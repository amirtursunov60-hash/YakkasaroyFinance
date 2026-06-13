---
name: supabase-migration
description: >
  Создание и применение миграций Supabase в этом проекте (Yakkasaroy). Использовать
  при любом изменении схемы БД: добавление/правка таблиц, колонок, enum-типов, функций,
  триггеров, RLS-политик, индексов; работа с фондами, доходами, Реестром fp_register,
  правами доступа, периодами ФП. Фиксирует соглашения проекта: новый файл миграции
  (не править применённые), RLS на родных функциях прав (my_role / is_fin_admin /
  has_location_access / has_fund_access / holds_position), outer_id и is_archived,
  деньги только через fp_register (балансы поддерживают триггеры), идемпотентность,
  применение через Supabase MCP. Не для изменений фронтенда (React/src).
---

# Миграции Supabase — правила проекта Yakkasaroy

Схема живёт в Supabase (PostgreSQL + RLS). Полное описание и история — `supabase/README.md`,
доменные принципы — `CLAUDE.md` («База данных», «Предметная область») и `docs/ТЗ_..._v2.md`.
Этот скилл — рабочая процедура, чтобы изменения схемы были консистентны и безопасны.

## Когда применять

- Любое изменение структуры БД: таблицы, колонки, enum, функции, триггеры, политики RLS, индексы.
- Новые RPC-функции (`fp_*`) для операций финконтура.
- Изменения прав доступа (RLS, таблицы персональных прав).

Не применять для правок фронтенда (`src/`) — там данные пока моки, схему не трогают.

## Железные правила (нарушать нельзя)

1. **Только новый файл миграции.** Применённые файлы в `supabase/migrations/` НЕ редактировать
   и НЕ удалять — они уже выполнены на боевой базе. Любая правка — новый файл сверху.
2. **Имя файла — `YYYYMMDDHHMMSS_краткое_описание.sql`** (UTC), как у свежих миграций
   (например `20260612202036_fund_operations.sql`). Лексикографический порядок = порядок применения.
   Имя на латинице, snake_case; комментарии и тексты ошибок — на русском.
3. **Идемпотентность.** Файл должен безопасно выполняться повторно:
   `create or replace`, `create table if not exists`, `create index if not exists`,
   `alter table ... add column if not exists`, `drop ... if exists`, `on conflict do nothing/update`,
   `do $$ begin ... if not exists (...) then ... end if; end $$;` для политик/типов.
4. **Деньги — только через Реестр `fp_register`.** Колонки `balance` фондов и счетов ДС
   руками НЕ писать: их ведут триггеры (`fp_register_balances`), запрет минуса
   (`fp_register_overdraft`), блокировка закрытого периода (`fp_register_period_lock`).
   Любое движение денег = вставка строки(к) в `fp_register`. Парные операции (перемещение/заём)
   связываются `pair_id`.
5. **Новые таблицы — всегда с RLS** на родных функциях прав (см. ниже) + колонки `outer_id uuid`
   (интеграции, nullable) и `is_archived boolean not null default false` (архив вместо удаления).
   Удаление записей — через `is_archived`, а не `delete`.
6. **Справочники не переименовывать** (фонды ФД1–ФД9/1, статьи РД, D-коды доходов, 7 отделений,
   состояния, коэффициенты ЗП) — это реальные стартовые данные.

## Права и RLS

Все политики опираются на готовые функции (не выдумывать новые механизмы):
`my_role()`, `is_fin_admin()`, `has_location_access(location_id)`, `has_fund_access(fund_id)`,
`holds_position(...)` + таблицы персональных прав `user_location_access`, `fund_access`,
`expense_type_access`.

- В RPC-функциях проверка в начале тела с русским исключением, например:
  `if not is_fin_admin() then raise exception 'Только финдиректор или владелец'; end if;`
- RLS-функции в политиках оборачивать в подзапрос для initplan-оптимизации (как в
  `20260612165910_rls_initplan_optimization.sql`): `using ( (select my_role()) = 'owner' )`,
  `using ( has_location_access(location_id) )` через `(select ...)` где функция стабильна.
- Под каждый внешний ключ — покрывающий индекс (см. `..._fk_covering_indexes.sql`).

## Шаблон RPC-функции финконтура

```sql
-- <Что делает> (ТЗ v2 §X.Y). Деньги проводятся строками Реестра — балансы ведут триггеры.
create or replace function public.fp_<действие>(p_... , p_period_id uuid, p_comment text default null)
returns void               -- или bigint / uuid, если нужен id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Недостаточно прав для операции';
  end if;
  -- валидация входа (суммы > 0, существование сущностей с not is_archived)
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
  values ('<op_type>', p_period_id, p_fund, p_amount, p_comment, auth.uid());
end $$;
```

## Шаблон новой таблицы

```sql
create table if not exists public.<имя> (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),     -- привязка к точке, если применимо
  -- ... доменные поля ...
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.<имя> enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = '<имя>' and policyname = '<имя>_read') then
    create policy "<имя>_read" on public.<имя> for select
      using ( is_fin_admin() or has_location_access(location_id) );
  end if;
end $$;
-- аналогично для insert/update; покрывающие индексы по FK
create index if not exists <имя>_location_idx on public.<имя>(location_id);
```

## Как применять (порядок действий)

1. Написать SQL в новый файл `supabase/migrations/<timestamp>_<name>.sql`.
2. Применить через **Supabase MCP** (`apply_migration`). Авторизация — вход в Supabase (OAuth).
   Убедиться, что в `.mcp.json` URL Supabase **без** `read_only=true` (иначе запись отключена).
   Альтернатива — вручную: Dashboard → SQL Editor → вставить → Run.
3. Проверить диагностическим SQL (`execute_sql`): объекты создались, RLS включён,
   функция отрабатывает на тестовых данных, баланс изменился через Реестр.
4. Дописать строку в таблицу истории в `supabase/README.md` (файл, статус «применён», содержимое).
5. Изменение оформить отдельным PR (правило проекта), сослаться по номеру PR.

## Чеклист перед коммитом

- [ ] Новый файл, применённые миграции не тронуты.
- [ ] Имя `YYYYMMDDHHMMSS_*.sql`, комментарии на русском, ссылка на § ТЗ.
- [ ] Идемпотентно (повторный прогон безопасен).
- [ ] У новых таблиц: RLS включён + политики на функциях прав, `outer_id`, `is_archived`, FK-индексы.
- [ ] Деньги — только через `fp_register`, балансы руками не писать.
- [ ] Справочники не переименованы; доменные термины ХМС сохранены.
- [ ] Запись добавлена в `supabase/README.md`.
