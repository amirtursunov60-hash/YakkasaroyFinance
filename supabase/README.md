# База данных (Supabase)

## Применение миграций

Два способа:

1. **Через Claude Code (Supabase MCP)** — основной. В корне репозитория есть `.mcp.json` с официальным Supabase MCP-сервером (https://mcp.supabase.com, авторизация через вход в Supabase — OAuth, токены не хранятся). После авторизации Claude применяет миграции (`apply_migration`) и выполняет диагностический SQL (`execute_sql`) сам. Внимание: параметр `read_only=true` в URL отключает запись — для применения миграций его быть не должно.
2. **Вручную**: Dashboard → SQL Editor → вставить содержимое файла → Run. По порядку номеров, каждый файл один раз (повторный запуск безопасен — файлы идемпотентны).

## Текущее состояние

**Базовая схема создана вне git** — вручную через Dashboard (июнь 2026, до подключения репозитория к процессу миграций). Это полная схема финконтура по ТЗ v2: 33 таблицы (`fp_periods`, `incomes`, `funds`, `fp_register`, `payment_requests`, `directives`, `reconciliations`, `counterparties`, оргсхема, статистики с квотами, `audit_log`, инвайты, права доступа по точкам/фондам/статьям) + enum-типы, функции прав и триггеры. SQL-дамп базовой схемы планируется добавить сюда как `000_baseline.sql` (справочно, не для выполнения).

Ключевые механизмы базовой схемы:

- **Реестр `fp_register`** — единая лента операций; триггер `fp_register_balances` поддерживает колонки `balance` фондов и счетов ДС, `fp_register_overdraft` запрещает уход в минус, `fp_register_period_lock` блокирует операции в закрытом периоде.
- Вставка в `incomes` автоматически порождает запись реестра (триггер `income_to_register`).
- Аудит: триггер `trg_audit` пишет изменения финансовых таблиц в `audit_log`.
- Права: RLS на функциях `my_role()`, `is_fin_admin()`, `has_location_access()`, `has_fund_access()`, `holds_position()` + таблицы персональных прав `user_location_access`, `fund_access`, `expense_type_access`.
- Везде `outer_id` (интеграции) и `is_archived` (архив вместо удаления); периоды — `starts_on`/`ends_on` (чт–ср).

## История миграций в этой папке

| Файл | Статус | Содержимое |
|---|---|---|
| `001_auth_profiles.sql` | применён | политики/функции поверх `profiles` — **отменён файлом 003** |
| `002_core.sql` | применён | дубли таблиц ядра (создание пропущено — таблицы уже были), лишние политики — **отменён файлом 003** |
| `003_cleanup.sql` | применён | удаляет объекты 001–002, дублировавшие и ослаблявшие базовую схему |
| `004_seed.sql` | применён | стартовые справочники прототипа: 6 точек, кассы и счета Алиф, фонды ФД1–ФД9/1, дерево D-кодов доходов, статьи РД (валюты и способы оплаты уже были залиты) |
| `005_fix_income_trigger.sql` | применён | приведение типа op_type в триггере trg_income_to_register — без него вставка дохода падает |
| `006_directive.sql` | применён | Директива: схема распределения по умолчанию (income_type_id nullable + сид 3 этапов) и функции fp_run_distribution / fp_close_period |
| `007_directive_stages.sql` | применён | поэтапное одобрение: fp_distribute_stage (этап в comment Реестра 'stage:…', включая перенос остатка 'stage:remainder'), fp_close_period помечает доходы распределёнными; fp_run_distribution удалена |
| `008_reopen_period.sql` | применён | fp_reopen_period — переоткрытие закрытой недели (протокол Директивы удаляется, при повторном закрытии создаётся заново) |
| `009_reset_and_autocreate.sql` | применён | fp_reset_distribution — сброс одобренного этапа/всего распределения (суммы списываются из фондов); fp_close_period теперь автосоздаёт следующую неделю |
| `20260615184000_ledger_concurrency_guards.sql` | **применён** | инварианты конкурентности леджера: fp_pay_request блокирует строку заявки `for update` + условный перевод статуса (защита от двойной оплаты), fp_distribute_stage блокирует строку периода `for update` (сериализация одобрения этапа), частичный UNIQUE-индекс `fp_register(request_id) where op_type='request_payment'` |
| `20260615185500_ledger_hardening_audit_reconcile.sql` | **применён** | доводка леджера: триггер `fp_register_no_update` (леджер неизменяем — UPDATE запрещён), функция `fp_reconcile_balances()` (сверка SUM(fp_register) = баланс фонда/счёта), аудит `fp_periods` и `directives` (переоткрытие/закрытие периода теперь пишутся в `audit_log`) |
| `20260615190000_fix_register_no_update_search_path.sql` | **применён** | фикс advisors `function_search_path_mutable`: зафиксирован `search_path = public` у `trg_register_no_update` |
| `20260615193000_enable_pgtap_testing.sql` | **применён** | включение pgTAP для модульного тестирования БД; тесты инвариантов леджера — в `supabase/tests/` |
| `20260616120000_org_chart.sql` | **применён** | оргсхема (ТЗ §4.3–4.4): в `org_divisions` — `color`, `ckp` + unique по `code`; в `org_positions` — `section`, `ckp`, `statistic`, `duties` (jsonb), `is_executive`, `sort`; enum `hat_status` (none/learning/done) + колонка в `position_assignments`; сидинг 7 отделений и постов прототипа (ЦКП, секции, шляпы) как стартовый справочник (RLS наследуется из baseline) |
| `20260616130000_request_form_fields.sql` | **применён** | форма заявки (ЗРС) по шаблону ManaJet: в `payment_requests` — `purpose` (цель расхода) и `tags` (метки, `text[]` not null default `{}`); период «К рассмотрению на ФП» использует существующую `period_id` (RLS наследуется из baseline) |
| `20260616140000_expense_type_defaults.sql` | **применён** | связь «вид расхода → источник/цель»: в `expense_types` — `default_fund_id` (uuid → `funds`) и `default_purpose` (text); форма ЗРС авто-подставляет фонд и цель при выборе вида расхода (привязка настраивается позже; RLS наследуется из baseline) |
| `20260616150000_request_decision_fields.sql` | **применён** | рассмотрение заявки в Директиве: в `payment_requests` — `approved_amount` (одобренная сумма, отдельно от запрошенной `planned_amount`; check `> 0` либо NULL) и `comment` (комментарий решения); `fp_pay_request` теперь оплачивает `coalesce(approved_amount, planned_amount)` (с блокировкой строки `for update`). RLS наследуется из baseline |
| `20260616160000_profile_avatar.sql` | **применён** | аватар сотрудника: `profiles.avatar_url` (text) + публичный бакет `avatars` с политиками (чтение всем, загрузка/замена — в свою папку по uid); self-update avatar_url разрешён политикой `profiles_self` |
| `20260616170000_avatar_admin_write.sql` | **применён** | админам (`is_fin_admin`) разрешена загрузка/замена аватара любого сотрудника (политики `avatars_insert`/`avatars_update` бакета `avatars` дополнены `OR is_fin_admin()`) |

## Тесты БД (pgTAP)

`supabase/tests/ledger_invariants_test.sql` — pgTAP-набор на инварианты леджера (существование Реестра/функций, триггеры неизменяемости/овердрафта/блокировки периода, unique-индекс против двойной оплаты, отсутствие UPDATE-политики на `fp_register`, аудит reopen/close, сверка `SUM(fp_register)` = баланс). Запуск: `supabase test db` (на ветке/staging) или `pg_prove`. Структурная + read-only часть (15 проверок) безопасна на любой среде, включая прод; поведенческие тесты с фикстурами (овердрафт/двойная оплата/закрытый период) — секция TODO в файле, запускать на ветке/staging.

`supabase/tests/org_chart_test.sql` — pgTAP на структуру оргсхемы (новые колонки отделений/постов, enum `hat_status`, наличие засеянного справочника: ≥ 7 отделений, ровно 7 руководящих постов). Только структурные/справочные проверки (11), ничего не пишут — безопасно везде.

`supabase/tests/request_form_fields_test.sql` — pgTAP на поля формы заявки (`payment_requests.purpose`, `tags` — тип `text[]`, NOT NULL). 4 структурные проверки, ничего не пишут.

`supabase/tests/expense_type_defaults_test.sql` — pgTAP на значения по умолчанию вида расхода (`expense_types.default_fund_id` — uuid, `default_purpose`). 3 структурные проверки, ничего не пишут.

`supabase/tests/request_decision_fields_test.sql` — pgTAP на поля рассмотрения заявки (`payment_requests.approved_amount` — numeric, `comment`; наличие `fp_pay_request`). 5 структурных проверок, ничего не пишут.

`supabase/tests/profile_avatar_test.sql` — pgTAP на аватар (`profiles.avatar_url`, наличие публичного бакета `avatars`). 2 проверки, ничего не пишут.

Файлы 001–002 оставлены как история применённого; выполнять их повторно не нужно. Прежние `003_finance.sql`/`004_seed.sql` к базе не применились (откатились с ошибкой) и заменены.

Правила распределения (`distribution_rules`) не сидируются: в схеме правило обязательно привязано к виду дохода (`income_type_id not null`), способ привязки стартовой схемы 3 этапов решается при реализации Директивы.

## Правила

- Любое изменение схемы — **только новым файлом миграции** (004, 005, …); применённые файлы не редактировать.
- Новые таблицы — всегда с RLS на родных функциях прав (`my_role()`, `is_fin_admin()`, `has_location_access()`...), с `outer_id` и `is_archived`.
- Балансы руками не трогать — только через операции в `fp_register` (их поддерживают триггеры).
- Стиль идемпотентности: `if not exists` / `on conflict` / `drop ... if exists`.
