# Разведка API ManaJet — фонды, периоды, ЗРС, статистики

> Рабочая заметка по интеграции. Зафиксировано фактическое поведение боевого API
> ManaJet на ключе компании «Яккасарой» (живые данные, не моки).
> Дата разведки: 2026-06-20. Статус API: **BETA / DEV** (надпись «------DEV------»
> на стартовой странице).

---

## 0. Доступ и аутентификация

- **База:** `https://api.manajet.org/api` — вызывать **напрямую**.
- **`api.adminsolution.org` — это лишь 301-редирект на `api.manajet.org`** (IIS,
  `Microsoft-IIS/10.0`, ASMX/ASP.NET MVC 5.2). ⚠️ При редиректе **между разными
  хостами заголовок `Authorization` стандартно отбрасывается**, а у `POST`-запросов
  301 ломает тело. Поэтому интеграция должна ходить на `api.manajet.org`, а не на
  `adminsolution.org`. Если сетевой политикой в whitelist добавлен только
  `api.adminsolution.org` — **нужно добавить `api.manajet.org`** (иначе серверные
  вызовы из Edge Functions работать не будут).
- **Авторизация:** заголовок `Authorization: <company>:<key>`
  (не `Bearer`, не Basic — буквально строка `company:key`). Наш ключ:
  `yakkasaroy:bf947924-a3f2-4b2a-8f4e-108601d0ea0f`.
  Без заголовка → `401 Authorization key required`.
- **CORS:** `Access-Control-Allow-Origin: *`, методы `GET, POST, PUT, DELETE, OPTIONS`,
  заголовки `Content-Type`. Т.е. теоретически дёргается и из браузера, но ключ
  светить на фронте нельзя → только серверный прокси (Supabase Edge Function).
- **Документация:** Swagger UI — `https://api.manajet.org/swagger`, спецификация —
  `https://api.manajet.org/swagger/docs/v1` (OpenAPI 2.0; 134 пути, 179 моделей).
  Ещё есть HTML-справка `/Help`. Заявки на ключ — `info@manajet.org`.
- **Формат:** JSON. Эндпоинты-списки принимают пагинацию/фильтры через query
  `filter.*` (`filter.skip`, `filter.take`, `filter.sort`, `filter.id_id`, +
  специфичные фильтры у каждого ресурса, см. ниже).
- Запись — `POST` с **массивом** объектов в теле (батч), ответ — `object`.

---

## 1. Фонды (Funds)

### `GET /api/FPFund` — справочник фондов
Фильтры: `filter.id_id`, `filter.in_archive`, `filter.sort`, `filter.skip`, `filter.take`.

Модель `ApiFpFund`: `id:int`, `name:string`, `number:string`, `in_archive:bool`.

**Живые данные (10 фондов, 2 точки):**

| id | number | name |
|----|--------|------|
| 5  | 1/ФД    | Хизматрасони Яккасарой |
| 3  | 1/ФД5   | Фонд Зарплаты Яккасарой |
| 6  | 1/ФД5.1 | Фонд Турсуновхо. Яккасарой |
| 7  | 1/ФД8   | Фонд Резервов Яккасарой |
| 9  | 1/ФД8/3 | Фонд Обязательств Яккасарой |
| 52 | 2/ФД5.4 | Фонд Турсуновхо. Доп услуги |
| 44 | 2/ФФ    | Хизматрасони Фемали |
| 72 | 2/ФФ5   | Фонд Зарплаты Фемали |
| 74 | 2/ФФ7   | Фонд Резерв Фемали |
| 42 | 2/ФФ8/1 | Фонд Флай гарден Карзи стройка |

Наблюдения:
- `number` несёт **префикс точки** (`1/…` Яккасарой, `2/…` Фемали) + ХМС-код фонда
  (`ФД`, `ФД5`, `ФД5.1`, `ФД8`, `ФФ…`). Точка кодируется в номере, отдельного поля
  точки у фонда в API нет.
- **Баланс фонда в самой модели `FPFund` НЕ отдаётся** — текущий остаток считается
  из Реестра (`/api/Register`, см. §4) либо из `FpAsset` (по плану).

### `GET /api/FpAsset` — счета ДС / активы ФП (с остатком по периоду)
Фильтры: `filter.id_id`, `filter.id_fp_plan`, `filter.in_archive`, `sort/skip/take`.
Модель `ApiFpAsset`: `id`, `name`, `number`, `in_archive`, `id_fp_plan:int`, `total:double`.

Это физические «кошельки» (сейфы/счета): `M1/11 Приходной сейф ФЕМАЛИ 2`,
`F5/3 Поставщики`, `F5/4 Авансы и Расход`, `М1 Приходной` и т.д. `total` отдаётся
**в разрезе периода** (`id_fp_plan`) — без фильтра по плану приходит `total=0`,
`id_fp_plan=0`. Для остатков надо запрашивать `?filter.id_fp_plan=<id>`.
Есть и запись: `POST /api/FpAsset` (тело — массив `ApiFpAsset`).

### `GET /api/FpCurrency` — валюты
Фильтры включают `outer_id`, `search`, `status`, `in_arhive` (опечатка в API — без `c`).
На нашем ключе **вернулся пустой ответ** (валюта в проводках идёт как `id_currency:1`).

### `GET /api/FpIncome` — операции дохода (наполнение фондов)
Фильтры: `date_from`, `date_to`, `id_income`, `id_company`, `sort/skip/take`.
Модель `IncomeOperationOutput`: `id`, `outer_id`, `date_operation`, `fp_plan{id,date_to}`,
`description`, `amount:double`, `income_type{id,name}`, `company{...}`, `document{...}`,
`fp_payment_type{id,name}`, `fp_asset`.
Пример: доход 9350 «Fly Garden Приходной», клиент, документ «А 8869», нал, в плане 322.
Запись — `POST /api/FpIncome` (массив `IncomeOperationInput`). Справочник видов
дохода — `GET /api/IncomeCategory` (D-коды: `D1/9 Торт Душанбе`, `D1/7 Оформление`…).

---

## 2. Периоды ФП (FpPlan)

### `GET /api/FpPlan` — недельные периоды финпланирования
Фильтры: `filter.id_id`, `filter.skip`, `filter.take`. Есть `GET /api/FpPlan/Count`,
`GET /api/FpPlan/{id}` и запись `POST /api/FpPlan` (`FpPlanInput`).

Модель `FpPlanOutput`: `id:int`, `date_from`, `date_to` (date-time),
`is_executive_confirmed:bool`, `is_baf_confirmed:bool`.

**Живые данные (последние периоды):**

| id  | date_from  | date_to    | exec_confirmed | baf_confirmed |
|-----|------------|------------|----------------|---------------|
| 322 | 2026-06-18 | 2026-06-24 | false | false |
| 321 | 2026-06-11 | 2026-06-17 | true  | true  |
| 320 | 2026-06-04 | 2026-06-10 | true  | true  |
| 319 | 2026-05-28 | 2026-06-03 | true  | true  |

Наблюдения (важно для маппинга на наш контур):
- Период = неделя **четверг → среда** (`date_from` 18.06.2026 — четверг,
  `date_to` 24.06 — среда; время `00:00:00` → `23:59:59`). **Точно совпадает с нашим
  правилом периода ФП чт–ср.**
- Два флага подтверждения: `is_executive_confirmed` (исполнительный) и
  `is_baf_confirmed` (BAF — совет/финкомитет). Текущая открытая неделя (322) — оба
  `false`; закрытые недели — оба `true`. Это и есть «закрытие периода Директивой» из
  нашего ТЗ (принцип 4) — двухступенчатое подтверждение.

---

## 3. ЗРС / маршрутные формы (RoutingForm)

В ManaJet формат ЗРС реализован как **Routing Form** — маршрут согласования из шагов
(`step`) и под-шагов (`sequence`) по постам оргсхемы.

### `GET /api/RoutingForm`
Фильтры: `filter.id_id`, `filter.in_arhive`, `filter.basketType`, `sort/skip/take`,
`filter.id_routing_form_template`.

Модель `ApiRoutingForm`:
`id`, `id_routing_form_template:int`, `id_person:int`, `dt_start`, `dt_end`,
`diff_term_in_minutes`, `max_step_dt_start`, `routing_form_step[]`, где каждый шаг —
`ApiRoutingFormStep`: `id_position:int` (пост-исполнитель), `status:int`,
`dt_start/dt_end/dt_term` (срок), `data_json`, `unfinished_description`,
`speed_ratio:double`, ссылки на предыдущий/следующий шаг, поля «запроса возврата»
(`requested_return_status`, `request_id_person`, `request_description`) и вложенный
`routing_form_step_sequence[]` (`is_finished`, `dt_end`).

Живой пример: форма id=1 (с 2022 г.), шаблон 1, шаг на посту 125, статус 2, срок
+10 дней, `unfinished_description:"пробный"`. На нашем ключе пока почти нет данных —
**ЗРС в боевой ManaJet толком не используется**, реальный поток расходов идёт через
**счета `Bill` и заявки `PurchaseOrder`** (см. §5).

### `GET /api/RoutingFormTemplate` — шаблон маршрута
⚠️ Требует **оба** обязательных query-параметра: `idRoutingFormTemplate` и
`idPresonStartFrom` (sic — опечатка `Preson`). Без них → 404
«No action was found». Возвращает `RoutingFormStepPostAPI` — это же тело и для
создания через `POST /api/RoutingForm`.

### Создание ЗРС — `POST /api/RoutingForm` (`RoutingFormStepPostAPI`)
Структура тела:
- `idRoutingFormTemplate`, `IdPresonStartFrom`, `goToNext:int`;
- `modelData` (`routing_form_step_API`: `id_position`, `status`, `dt_*`,
  `unfinished_description`);
- `sequence[]` — под-шаги, каждый с:
  - `modelData` (`routing_form_step_sequence_API`),
  - `_fields[]` (`CompanyCustomDataPOSTAPI`) — **кастомные поля формы**: пара
    `_custom_field` + типизированное значение (`_integer_data` / `_text_data` /
    `_datetime_data` / `_bit_data` / `_floating_data` / `_field_data_id`).
- `GET /api/RoutingForm/CustomFieldsForSequence` — список кастомных полей под-шага
  (требует параметры; без них 404).

> Вывод по ЗРС: модель есть и гибкая (шаги по постам + кастомные поля = «данные →
> ситуация → решение»), но в боевой базе Яккасарой не наполнена. Для интеграции
> расходов на старте практичнее опираться на `Bill`/`PurchaseOrder`, а RoutingForm
> подключать, когда заказчик начнёт вести ЗРС в ManaJet.

---

## 4. Реестр и движение денег (Register) — контекст для фондов/периодов

### `GET /api/Register` — единая лента операций ФП (двойная запись)
Фильтры: `id_id`, `outer_id`, `search`, `period_begin`, `period_end`,
`operation_type`, `id_company`, `id_stock_document`, `id_fp_purchase_order`,
`id_fp_payment_type`, `sort/skip/take`. Есть `Count`, `/{id}`,
`POST /api/RegisterOuterId`.

Модель `ApiRegisterOutput`: `id`, `type:int` (тип операции), `date_operation`,
`description`, `id_company`+`company`, `id_fp_payment_type`+`fp_payment_type`,
`id_fp_purchase_order`+`fp_purchase_order`, `id_stock_document`+`stock_document`,
`outer_id`, и **`register_element[]`** — собственно проводки:
```
register_element: {
  id_fp_ledger_debet, fp_ledger_debet:{ number, name, id_fp_asset, id_fp_income, id_fp_fund, id_fp_expense },
  id_fp_ledger_kredit, fp_ledger_kredit:{ ... те же поля ... },
  elem_sum:double, id_currency
}
```
Пример проводки: дебет `РД1 «Поставщики и фирмы»` (`id_fp_expense=1`) /
кредит `ФД1/1 «Поставщики Яккасарой»` (`id_fp_fund=4`), сумма 20073.

**Ключевой вывод:** Реестр ManaJet — это **двусторонний леджер** (дебет/кредит), где
каждый счёт леджера ссылается ровно на одну сущность: актив / доход / **фонд** /
статью расхода. Это 1:1 ложится на наш `fp_register` как источник истины (принцип 5
ТЗ): остаток фонда = свёртка `register_element` по `id_fp_fund`. `type` у всех
наблюдённых операций = `20` (нужно собрать справочник типов отдельно).

Сопутствующие справочники: `GET /api/PaymentType` (`1 Наличные/Нахт`),
`GET /api/SheetOfAccounts` (план счетов леджера), `GET /api/ExpenseCategory` (РД-статьи).

---

## 5. Расходы: счета и заявки (рабочий поток вместо ЗРС)

- **`GET/POST /api/Bill`** (`ApiBillOutput`/`ApiBillInput`) — счета поставщиков.
  Богатые фильтры, в т.ч. `id_fp_plan_approved` и `id_fp_plan_payment` — **счёт
  живёт в двух периодах** (одобрения и оплаты). Это в точности принцип 4 нашего ТЗ.
  Оплата — `POST /api/BillPayment`. Вложения — `BillAttachment` (+
  `ExportFromTemplate`).
- **`GET/POST /api/PurchaseOrder`** (`PurchaseOrderInput/Output`) — заявки на
  расход **от поста** (`filter.id_position`, `approvedOnly`, `status`,
  `id_fp_plan`/`id_fp_plan_payment`). Оплата — `POST /api/PurchaseOrderPayment`.
- **`GET /api/OrgBoardPosition`** — оргсхема (посты): `number`, `full_number`,
  `person{id,name}`, `functional` (ЦКП/функция). Напр. пост `7.0 Руководитель` →
  Турсунов Амир. На посты ссылаются и заявки, и шаги ЗРС.

---

## 6. Статистики (Stat / StatValue)

### `GET /api/Stat` — определения статистик
Фильтры: `id_id`, `name`, `stat_type`, `period`, `orgboard_position`, `in_arhive`,
`sort/skip/take`. Есть `Count`, `/{id}`, запись `POST /api/Stat`.

Модель `ApiStat`: `id`, `name`, `id_position_enters:int` (пост, который вносит
значение), `id_position_ref:int`, `unit:string`, `stat_type:int` (enum),
`max_val`/`min_val:double` (целевой коридор), `sign:bool` (направление «вверх =
хорошо»), `view_period`/`period:int` (enum 0–5), `value_type:int`, `id_company`,
`id_aida`, `date_from_showing`, `comment`, `orgboard_position{id,name,number}`,
**`last_3_vals[]`** — последние 3 значения прямо в карточке статистики.

**Живые данные (10 статистик):**

| id  | name | stat_type | unit | period | пост (enters) |
|-----|------|-----------|------|--------|----------------|
| 11  | Активы и Резервы | 12 | Сомон | 2 | 81 (реф. 92 «Руководитель 3.1») |
| 86  | Выручка Кетеринг | 8 | Сом | 2 | — |
| 87  | Выручка Оформление | 8 | Сом | 2 | — |
| 65  | Выручка Яккасарой Душанбе | 8 | сомон | 2 | — |
| 96  | Гранд Холл | 8 | Сомони | 2 | — |
| 105 | Дивиденд Душанбе | 11 | Сомон | 2 | — |
| 106 | Дивиденд Душанбе доп | 11 | Сомон | 2 | — |
| 1   | Доход больше чем расходы +резерв | 8 | Сомон | 2 | — |
| 108 | Количество выпусков | 1 | шт | 2 | — |
| 74  | Количество назначенных встреч | 1 | встречи | 2 | — |

Наблюдения:
- `stat_type` (enum: 1,2,3,4,5,8,9,10,11,12,20,23,24,30…82) — тип статистики.
  Наблюдённые: `1` — счётная (шт/встречи), `8` — денежная выручка/доход,
  `11` — дивиденд, `12` — активы/резервы (с коридором `min_val..max_val`,
  напр. 7 000 000…16 000 000). Полную расшифровку enum API метками не даёт —
  собрать по `/Help` или у поддержки.
- `period=2` у всех = **неделя** (совпадает с шкалой нашего расчёта состояний ХМС).
  `view_period` (0–5) — горизонт отображения графика.
- `sign:true` = рост желателен (нужно для расчёта состояний Власть/Норма/Опасность —
  наша `calcState` в `src/utils/stats.ts`).
- `last_3_vals[]` отдаёт `{period_begin, period_end, amount, is_quota}` — удобно для
  спарклайнов без отдельного запроса.

### `GET /api/StatValue` — значения статистик по периодам
Фильтры: `filter.stat_id`, `filter.begin`, `filter.end`, `filter.is_quota`,
`search`, `sort/skip/take`. Есть `Count` и **запись `POST /api/StatValue`**
(массив `ApiStatValue`) — это и есть основной пример из доки на главной странице.

Модель `ApiStatValue`: `stat_id:int`, `period_begin`/`period_end` (date-time),
`description`, `amount:string` (⚠️ значение строкой!), `is_quota:bool`.

Живой пример: `{stat_id:105, period_begin:2026-06-18, period_end:2026-06-24,
amount:"215000", is_quota:false}`. `is_quota=true` — это **квота/план** на период
(отдельно от факта). Недельные значения идут с границами чт–ср; есть и дневные
(`stat_id:109` за один день 19.06).

---

## 7. Маппинг на наш контур (кратко)

| ManaJet API | Наша модель (Supabase / ТЗ v2) |
|-------------|-------------------------------|
| `FPFund` (id, number, name) | `funds` (код фонда, точка — из префикса number) |
| `FpAsset` (+ id_fp_plan, total) | `cash_accounts` / счета ДС, остаток по периоду |
| `FpPlan` (date_from/to, *_confirmed) | период ФП (`starts_on`/`ends_on`), закрытие Директивой |
| `Register` + `register_element` (debet/kredit) | `fp_register` — двойная запись, источник истины |
| `FpIncome` / `IncomeCategory` | `incomes` / виды дохода (D-коды) |
| `Bill` (+ approved/payment plan) | счета поставщиков в двух периодах |
| `PurchaseOrder` (id_position) | заявки от поста |
| `RoutingForm` (+ custom fields) | ЗРС (в боевой базе пока не наполнена) |
| `Stat` / `StatValue` | статистики + значения; `is_quota` = квота/план |
| `OrgBoardPosition` | оргсхема (посты, ЦКП) |

Связь по интеграции — через `outer_id` (есть и у нас, и в ManaJet у части сущностей:
Register/Income/Company/Bill/Currency…). Для идемпотентной синхронизации писать
`outer_id` с обеих сторон.

## 8. Открытые вопросы (для поддержки `info@manajet.org`)

1. Расшифровка enum `Stat.stat_type` (33 значения) и `Register.type` (наблюдали только 20).
2. Точная семантика `is_executive_confirmed` vs `is_baf_confirmed` у `FpPlan`.
3. Почему `FpCurrency` пуст — валюты не заведены или нужен иной фильтр?
4. Какие операции реально создаются через API (права ключа на `POST`): проверить на
   тестовом периоде, не трогая закрытые недели.
5. Лимиты пагинации `filter.take` по умолчанию (списки вернули по 10).
