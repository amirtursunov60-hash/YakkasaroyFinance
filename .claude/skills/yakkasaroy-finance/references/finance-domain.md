# Финконтур Yakkasaroy — справочник

Подробный справочник к скиллу `yakkasaroy-finance`. Грузить при необходимости.
**Источник истины о схеме — миграции в `supabase/migrations/` (самый свежий файл) и
`supabase/README.md`.** Этот файл — навигатор, а не замена сверки со схемой.

## Первоисточники (читать при сомнениях)

- `docs/ТЗ_Yakkasaroy_Management_System_v2.md` — актуальное ТЗ (v2.0). Глоссарий — Приложение А.
- `docs/manajet-логика.md` — «почему так»: ФРС и 3 этапа фондов, точка безубыточности,
  еженедельная процедура ФП, расчётные счета, ЗРС, ЗП по баллам, дебиторка. §15 —
  «концепт курса → реализация», §16 — что в финкурсе НЕ раскрыто.
- `docs/funds-spec.md` — спека вкладки «Фонды»: колонки Остаток/Доступно/Долг, 4 типа
  операций, режимы фонда (накопительный, запрет перемещения, приватный), этап фонда.
- `supabase/README.md` — состояние схемы, история миграций (таблица статусов), pgTAP-тесты.
- `CLAUDE.md` — правила репозитория (стиль, мобильная адаптация, DoD, PR-воркфлоу).

## 3 этапа распределения (ФРС)

Все деньги при поступлении распределяются по фондам по схемам в 3 этапа:
1. **выручка** (`revenue`) — от валовой выручки;
2. **маржинальный** (`marginal`) — от маржинального дохода;
3. **скорректированный** (`adjusted`) — от скорректированного дохода.

Этап — свойство **фонда** (`funds.stage`, один этап). «Домашний этап» в Директиве =
дефолтное правило `distribution_rules` (`income_type_id IS NULL`). Смена этапа фонда —
RPC `fp_set_fund_stage` (синхронизирует дефолтное правило). Правило «ФД6 с двух этапов»
отменено заказчиком (см. `funds-spec.md` §10).

## Ключевые таблицы (по baseline + миграциям)

- `fp_register` — **Реестр**: единая лента всех операций ФП, источник истины. Колонки
  включают `op_type` (enum `register_op_type`), сумму, `fund_id`/`cash_account_id`,
  `period_id`, `location_id`, `pair_id` (парные записи перемещений/займов),
  `request_id`, `reverses_id` (на откатываемую строку), `comment` (в т.ч. метки этапа
  `stage:…`, `stage:remainder`).
- `funds` — фонды: `balance` (физические деньги, ведёт триггер), `code`, `name`,
  `stage`, `description`, `color`, `no_transfer`, `is_private`, `folder_id`,
  `location_id`, `is_archived`. Тип «накопительный» (`accumulative`) запрещает оплату
  счетов/заявок из фонда.
- `fund_folders` — группы фондов (рендер — сворачиваемая секция): `color`,
  `description`, `is_archived`.
- `cash_accounts` — счета ДС: `balance` (ведёт триггер). Доход указывает, куда физически
  пришли деньги (счёт ДС + способ оплаты).
- `incomes` — доходы; вставка порождает запись Реестра (`trg_income_to_register`).
- `payment_requests` — заявки ЗРС (от поста оргсхемы): `planned_amount`,
  `approved_amount` (check `>0` или NULL), `purpose`, `tags` (`text[]`), `comment`,
  `period_id`, статус (`approved`/…).
- `supplier_bills` — счета поставщиков (живут в двух периодах: одобрения и оплаты).
- `client_invoices` — счета клиентам / дебиторка.
- `payroll_sheets` — ведомости ЗП.
- `distribution_rules` — правила распределения (`fund_id`, `income_type_id`, `stage`,
  `percent`); UNIQUE `(fund_id, stage)` для дефолтного правила.
- `fp_periods` — недельные периоды ФП (чт–ср): `starts_on`/`ends_on`, статус
  (`active`/`closed`).
- `directives` — Директивы (закрытие периода, протокол распределения).
- `reconciliations`, `audit_log` — сверки и аудит.
- Права: `user_location_access`, `fund_access`, `expense_type_access`.
- Оргсхема: `org_divisions` (7 отделений, `code`/`color`/`ckp`),
  `org_positions` (`section`/`ckp`/`statistic`/`duties` jsonb/`is_executive`/`sort`),
  `position_assignments` (+ `hat_status`: none/learning/done).

## enum `register_op_type` (значения операций Реестра)

`income`, `expense`, `distribution`, `fund_transfer`, `fund_loan`, `fund_loan_return`,
`fund_income`, `fund_return`, `request_payment`, `bill_payment`, `cash_transfer`,
`fx_exchange`, `adjustment`.
(Сверять с самой свежей миграцией — список расширяется; например `fund_income`/
`fund_return` добавлены в `20260618120000_funds_tab_fields_and_ops.sql`.)

## RPC-функции (серверная логика движения денег)

| RPC | Назначение |
|---|---|
| `ensure_fp_period` | гарантировать существование периода для даты |
| `fp_distribute_stage` | одобрить (распределить) этап в Директиве; метка `stage:…` в Реестре |
| `fp_close_period` | закрыть неделю Директивой; помечает доходы распределёнными; автосоздаёт следующую неделю |
| `fp_reopen_period` | переоткрыть закрытую неделю (протокол Директивы удаляется) |
| `fp_reset_distribution` | сбросить одобренный этап/всё распределение (списать из фондов) |
| `fp_run_distribution` | **удалена** (была в 006, убрана в 007) — не использовать |
| `fp_fund_transfer` | перемещение фонд→фонд (парные записи; проверка `no_transfer`) |
| `fp_fund_loan` / `fp_fund_loan_return` | заём фонд→фонд и его возврат (колонка «Долг») |
| `fp_fund_income` / `fp_fund_return` | ручной приход / возврат фонда (проверки режимов) |
| `fp_reverse_fund_op` | откат операции фонда компенсирующей записью (только открытый период; для `fund_loan` — полный возврат) |
| `fp_pay_request` | оплата заявки ЗРС (`for update`; `coalesce(approved_amount, planned_amount)`; запрет накопительного фонда) |
| `fp_pay_bill` / `fp_pay_invoice` / `fp_pay_payroll` | оплата счёта поставщика / счёта клиента / ЗП |
| `fp_cash_transfer` | перевод между счетами ДС |
| `fp_set_fund_stage` | смена этапа фонда (переносит дефолтное правило распределения) |
| `fp_reconcile_balances` | сверка `SUM(fp_register)` = баланс фонда/счёта |
| `redeem_invite` | погашение инвайта сотрудника |

## Триггеры-инварианты

- `trg_income_to_register` — вставка дохода → запись Реестра.
- `fp_register_no_update` / `trg_register_no_update` — Реестр неизменяем (запрет UPDATE),
  `search_path = public` зафиксирован.
- Триггеры баланса Реестра — поддержка `balance`, **запрет минуса**, **блокировка
  закрытого периода** (в baseline: `fp_register_balances`, `fp_register_overdraft`,
  `fp_register_period_lock`).
- `trg_request_approve_funds_check` / `trg_bill_approve_funds_check` — запрет одобрения
  сверх «Доступно» при переводе в `approved`.
- `audit_*` (`fp_periods`, `directives`, `supplier_bills`, `client_invoices`,
  `payroll_sheets`) — запись изменений в `audit_log`.

## Функции прав (для RLS новых таблиц)

`my_role()`, `is_fin_admin()` (он же `is_fin`), `has_location_access()`,
`has_fund_access()` (учитывает `is_private`), `holds_position()`.

## pgTAP-тесты (`supabase/tests/`)

- `ledger_invariants_test.sql` — инварианты леджера (неизменяемость, овердрафт, блокировка
  периода, unique против двойной оплаты, сверка балансов). Структурная часть (15) безопасна
  везде; поведенческие с фикстурами — на ветке/staging.
- `org_chart_test.sql`, `request_form_fields_test.sql`, `expense_type_defaults_test.sql`,
  `request_decision_fields_test.sql`, `profile_avatar_test.sql`, `funds_tab_test.sql` —
  структурные проверки соответствующих миграций.

Запуск: `supabase test db` (ветка/staging) или `pg_prove`.

## Роли

`owner`, `fin_director`, `ops_director`, `location_manager`, `accountant`, `employee`.
Деньги активно двигают `owner` и `fin_director`; остальные — просмотр по RLS/`fund_access`.
