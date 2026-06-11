-- ============================================================================
-- 004 · Стартовые данные из прототипа (src/data/finance.js)
-- По ТЗ v2 §10 п.6 справочники прототипа — реальные стартовые данные системы.
-- Все вставки идемпотентны (on conflict do nothing) — можно перезапускать.
-- ============================================================================

-- ---------------------------------------------------------------- Валюты
insert into public.currencies (code, name, is_base) values
  ('TJS', 'Сомони', true),
  ('USD', 'Доллар США', false),
  ('RUB', 'Российский рубль', false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- Способы оплаты
insert into public.payment_types (name) values
  ('Наличные'), ('Перечисление'), ('Корпоративная карта')
on conflict (name) do nothing;

-- ---------------------------------------------------------------- Точки сети
-- Список собран из дерева доходов и касс прототипа — уточнить состав с владельцем.
insert into public.locations (code, name, city, kind) values
  ('DUS', 'Яккасарой Душанбе', 'Душанбе', 'tuyhona'),
  ('MRK', 'Яккасарой Марказ',  'Душанбе', 'tuyhona'),
  ('FLY', 'Fly Garden',        'Душанбе', 'restaurant'),
  ('FM1', 'Фемали 1',          'Душанбе', 'restaurant'),
  ('FM2', 'Фемали 2 Марказ',   'Душанбе', 'restaurant'),
  ('KHJ', 'Яккасарой Худжанд', 'Худжанд', 'tuyhona')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- Счета ДС
insert into public.cash_accounts (name, currency_code, kind, location_id) values
  ('Касса Душанбе',             'TJS', 'cash', (select id from public.locations where code = 'DUS')),
  ('Касса Худжанд',             'TJS', 'cash', (select id from public.locations where code = 'KHJ')),
  ('Расчётный счёт Алиф (TJS)', 'TJS', 'bank', null),
  ('Расчётный счёт Алиф (USD)', 'USD', 'bank', null),
  ('Fly Garden касса',          'TJS', 'cash', (select id from public.locations where code = 'FLY'))
on conflict (name) do nothing;

-- ---------------------------------------------------------------- Фонды ФД1–ФД9/1
-- Закрытые (доступ только финролям): ФД5 Учредители, ФД6 Резервы, ФД7 Строительный.
insert into public.funds (code, name, kind, is_restricted, sort) values
  ('FD1',   'Поставщики и Фирмы',      'working', false, 10),
  ('FD1/1', 'Поставщики доп услуги',   'working', false, 11),
  ('FD2',   'Хизматрасони',            'working', false, 20),
  ('FD3',   'Фонд зарплаты',           'working', false, 30),
  ('FD3/3', 'Флай Гарден',             'working', false, 33),
  ('FD4',   'Налог',                   'working', false, 40),
  ('FD5',   'Фонд учредителей',        'working', true,  50),
  ('FD6',   'Фонд Резервов',           'reserve', true,  60),
  ('FD7',   'Строительный',            'working', true,  70),
  ('FD8',   'Комунальные Услуги',      'working', false, 80),
  ('FD9',   'Процент Руководителям',   'working', false, 90),
  ('FD9/1', 'Развитие',                'working', false, 91)
on conflict (code) do nothing;

-- ------------------------------------------------- Схема распределения по умолчанию
-- Три этапа из прототипа (FUND_LEVELS). ФД6 — на двух этапах: revenue 10% и margin 8%.
-- Вместо on conflict — where not exists: on conflict не выводит уникальный
-- индекс nulls not distinct на части версий PostgreSQL (ошибка 42P10).
insert into public.distribution_rules (income_type_id, fund_id, stage, percent)
select null, f.id, r.stage, r.pct
from (values
  -- Этап 1: от выручки
  ('FD1',   'revenue',  5.0),
  ('FD1/1', 'revenue',  5.0),
  ('FD2',   'revenue', 15.0),
  ('FD6',   'revenue', 10.0),
  -- Этап 2: от маржинального дохода
  ('FD3',   'margin',  25.0),
  ('FD3/3', 'margin',   5.0),
  ('FD4',   'margin',  12.0),
  ('FD5',   'margin',  20.0),
  ('FD6',   'margin',   8.0),
  ('FD7',   'margin',   5.0),
  ('FD8',   'margin',  15.0),
  ('FD9',   'margin',  10.0),
  -- Этап 3: от скорректированного дохода
  ('FD9/1', 'adjusted', 10.0)
) as r (fund_code, stage, pct)
join public.funds f on f.code = r.fund_code
where not exists (
  select 1 from public.distribution_rules d
  where d.income_type_id is null and d.fund_id = f.id and d.stage = r.stage
);

-- ---------------------------------------------------------------- Виды дохода (D-коды)
-- Папки (направления/точки)
insert into public.income_types (code, name, color, sort, location_id) values
  ('D1',   'Душанбе Яккасарой', '#e8911c', 10, (select id from public.locations where code = 'DUS')),
  ('D1.1', 'Яккасарой Марказ',  '#e8911c', 20, (select id from public.locations where code = 'MRK')),
  ('D1.2', 'Флай гарден',       '#e8911c', 30, (select id from public.locations where code = 'FLY')),
  ('D1.3', 'Фемали 1',          '#e8911c', 40, (select id from public.locations where code = 'FM1')),
  ('D1.4', 'Фемали 2 Марказ',   '#e8911c', 50, (select id from public.locations where code = 'FM2')),
  ('D1.5', 'Кейтринг',          '#2f9e44', 60, null),
  ('D1.6', 'Прямой фонд',       '#d6c14a', 70, null)
on conflict (code) do nothing;

-- Листья
insert into public.income_types (code, name, color, sort, parent_id)
select v.code, v.name, v.color, v.sort, p.id
from (values
  -- D1 · Душанбе Яккасарой
  ('D1/1',   'ВИП зал',                '#7bd88f', 11, 'D1'),
  ('D1/2',   'ВИП Доп стол',           '#e0463b', 12, 'D1'),
  ('D1/3',   'ЛЮКС зал',               '#5bd6c9', 13, 'D1'),
  ('D1/4',   'Люкс Доп стол',          '#2f9e44', 14, 'D1'),
  ('D1/5',   'Оши нахор ВИП Зал',      '#d6c14a', 15, 'D1'),
  ('D1/6',   'Оши Нахор Люкс',         '#e0463b', 16, 'D1'),
  ('D1/7',   'Оформление',             '#e8911c', 17, 'D1'),
  ('D1/8',   'Видео камера Душанбе',   '#9c6ade', 18, 'D1'),
  ('D1/9',   'Торт Душанбе',           '#7bd88f', 19, 'D1'),
  -- D1.1 · Яккасарой Марказ
  ('D1/1/1', 'Grand Hall Марказ',      '#5bd6c9', 21, 'D1.1'),
  ('D1/1/2', 'Grand доп стол',         '#d64ad6', 22, 'D1.1'),
  ('D1/1/3', 'Grand оши нахор',        '#7bd88f', 23, 'D1.1'),
  ('D1/1/4', 'Поставщики услуг Grand', '#5b8def', 24, 'D1.1'),
  ('D1/1/5', 'Торт grand',             '#5bd6c9', 25, 'D1.1'),
  ('D1/1/6', 'Оформление Grand',       '#e8911c', 26, 'D1.1'),
  -- D1.2 · Флай гарден
  ('D1/2/1', 'Fly Garden Приходной',   '#7bd88f', 31, 'D1.2'),
  ('D1/2/2', 'Оформление Fly Garden',  '#e8911c', 32, 'D1.2'),
  ('D1/2/3', 'Торт Fly Garden',        '#5bd6c9', 33, 'D1.2'),
  -- D1.3 / D1.4 · Фемали
  ('D1/3/1', 'Фемели',                 '#7bd88f', 41, 'D1.3'),
  ('D1/4/1', 'Фемали 2',               '#7bd88f', 51, 'D1.4')
) as v (code, name, color, sort, parent_code)
join public.income_types p on p.code = v.parent_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------- Статьи расхода (РД)
insert into public.expense_types (code, name, color, sort) values
  ('РД1', 'Продукты и поставщики',  '#5b8def', 10),
  ('РД2', 'Маркетинг и реклама',    '#3f9e6a', 20),
  ('РД3', 'Зарплата',               '#d6c14a', 30),
  ('РД4', 'Налоги',                 '#c46b3f', 40),
  ('РД8', 'Оборудование и ремонт',  '#a857a8', 80),
  ('РД9', 'Административные',       '#4a6fa5', 90)
on conflict (code) do nothing;

insert into public.expense_types (code, name, sort, parent_id)
select v.code, v.name, v.sort, p.id
from (values
  ('РД1/1', 'Мясо и птица',           11, 'РД1'),
  ('РД1/2', 'Овощи и фрукты',         12, 'РД1'),
  ('РД1/3', 'Бакалея',                13, 'РД1'),
  ('РД1/4', 'Напитки',                14, 'РД1'),
  ('РД2/1', 'Instagram / SMM',        21, 'РД2'),
  ('РД2/2', 'Полиграфия и баннеры',   22, 'РД2'),
  ('РД3/1', 'ФОТ Душанбе',            31, 'РД3'),
  ('РД3/2', 'ФОТ Марказ',             32, 'РД3'),
  ('РД3/3', 'ФОТ Fly Garden',         33, 'РД3'),
  ('РД8/1', 'Ремонт оборудования',    81, 'РД8'),
  ('РД8/3', 'Новое оборудование',     83, 'РД8'),
  ('РД9/5', 'Оплаты гос структурам',  95, 'РД9'),
  ('РД9/6', 'Канцелярия и связь',     96, 'РД9')
) as v (code, name, sort, parent_code)
join public.expense_types p on p.code = v.parent_code
on conflict (code) do nothing;
