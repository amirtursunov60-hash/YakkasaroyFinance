-- ============================================================================
-- 004 · Стартовые справочники из прототипа (src/data/finance.js)
-- По ТЗ v2 §10 п.6 справочники прототипа — реальные стартовые данные системы.
-- Валюты и способы оплаты уже залиты ранее — здесь не трогаются.
-- Правила распределения (distribution_rules) сознательно не сидируются:
-- в схеме income_type_id обязателен (правило привязано к виду дохода),
-- схему привязки решим при реализации Директивы.
-- Все вставки идемпотентны (where not exists / on conflict) — можно перезапускать.
-- ============================================================================

-- ---------------------------------------------------------------- Точки сети
-- Список собран из дерева доходов и касс прототипа — состав уточнить с владельцем.
insert into public.locations (name, city, type)
select v.name, v.city, v.type::location_type
from (values
  ('Яккасарой Душанбе', 'Душанбе', 'tuyhona'),
  ('Яккасарой Марказ',  'Душанбе', 'tuyhona'),
  ('Fly Garden',        'Душанбе', 'restaurant'),
  ('Фемали 1',          'Душанбе', 'restaurant'),
  ('Фемали 2 Марказ',   'Душанбе', 'restaurant'),
  ('Яккасарой Худжанд', 'Худжанд', 'tuyhona')
) as v (name, city, type)
where not exists (select 1 from public.locations l where l.name = v.name);

-- ---------------------------------------------------------------- Счета ДС
insert into public.cash_accounts (name, type, currency_id, location_id)
select v.name, v.type::cash_account_type,
       (select id from public.currencies where code = v.cur),
       (select id from public.locations where name = v.loc)
from (values
  ('Касса Душанбе',             'cash', 'TJS', 'Яккасарой Душанбе'),
  ('Касса Худжанд',             'cash', 'TJS', 'Яккасарой Худжанд'),
  ('Расчётный счёт Алиф (TJS)', 'bank', 'TJS', null),
  ('Расчётный счёт Алиф (USD)', 'bank', 'USD', null),
  ('Fly Garden касса',          'cash', 'TJS', 'Fly Garden')
) as v (name, type, cur, loc)
where not exists (select 1 from public.cash_accounts c where c.name = v.name);

-- ---------------------------------------------------------------- Фонды ФД1–ФД9/1
-- Закрытые (is_restricted): ФД5 Учредители, ФД6 Резервы, ФД7 Строительный.
-- ФД6 — накопительный, остальные рабочие.
insert into public.funds (code, name, kind, is_restricted, currency_id)
select v.code, v.name, v.kind::fund_kind, v.restricted,
       (select id from public.currencies where code = 'TJS')
from (values
  ('FD1',   'Поставщики и Фирмы',    'working',      false),
  ('FD1/1', 'Поставщики доп услуги', 'working',      false),
  ('FD2',   'Хизматрасони',          'working',      false),
  ('FD3',   'Фонд зарплаты',         'working',      false),
  ('FD3/3', 'Флай Гарден',           'working',      false),
  ('FD4',   'Налог',                 'working',      false),
  ('FD5',   'Фонд учредителей',      'working',      true),
  ('FD6',   'Фонд Резервов',         'accumulative', true),
  ('FD7',   'Строительный',          'working',      true),
  ('FD8',   'Комунальные Услуги',    'working',      false),
  ('FD9',   'Процент Руководителям', 'working',      false),
  ('FD9/1', 'Развитие',              'working',      false)
) as v (code, name, kind, restricted)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- Виды дохода (D-коды)
-- Папки (направления/точки)
insert into public.income_types (code, name, location_id)
select v.code, v.name, (select id from public.locations where name = v.loc)
from (values
  ('D1',   'Душанбе Яккасарой', 'Яккасарой Душанбе'),
  ('D1.1', 'Яккасарой Марказ',  'Яккасарой Марказ'),
  ('D1.2', 'Флай гарден',       'Fly Garden'),
  ('D1.3', 'Фемали 1',          'Фемали 1'),
  ('D1.4', 'Фемали 2 Марказ',   'Фемали 2 Марказ'),
  ('D1.5', 'Кейтринг',          null),
  ('D1.6', 'Прямой фонд',       null)
) as v (code, name, loc)
where not exists (select 1 from public.income_types t where t.code = v.code);

-- Листья (статьи доходов)
insert into public.income_types (code, name, parent_id)
select v.code, v.name,
       (select id from public.income_types p where p.code = v.parent_code limit 1)
from (values
  -- D1 · Душанбе Яккасарой
  ('D1/1',   'ВИП зал',                'D1'),
  ('D1/2',   'ВИП Доп стол',           'D1'),
  ('D1/3',   'ЛЮКС зал',               'D1'),
  ('D1/4',   'Люкс Доп стол',          'D1'),
  ('D1/5',   'Оши нахор ВИП Зал',      'D1'),
  ('D1/6',   'Оши Нахор Люкс',         'D1'),
  ('D1/7',   'Оформление',             'D1'),
  ('D1/8',   'Видео камера Душанбе',   'D1'),
  ('D1/9',   'Торт Душанбе',           'D1'),
  -- D1.1 · Яккасарой Марказ
  ('D1/1/1', 'Grand Hall Марказ',      'D1.1'),
  ('D1/1/2', 'Grand доп стол',         'D1.1'),
  ('D1/1/3', 'Grand оши нахор',        'D1.1'),
  ('D1/1/4', 'Поставщики услуг Grand', 'D1.1'),
  ('D1/1/5', 'Торт grand',             'D1.1'),
  ('D1/1/6', 'Оформление Grand',       'D1.1'),
  -- D1.2 · Флай гарден
  ('D1/2/1', 'Fly Garden Приходной',   'D1.2'),
  ('D1/2/2', 'Оформление Fly Garden',  'D1.2'),
  ('D1/2/3', 'Торт Fly Garden',        'D1.2'),
  -- D1.3 / D1.4 · Фемали
  ('D1/3/1', 'Фемели',                 'D1.3'),
  ('D1/4/1', 'Фемали 2',               'D1.4')
) as v (code, name, parent_code)
where not exists (select 1 from public.income_types t where t.code = v.code);

-- ---------------------------------------------------------------- Статьи расхода (РД)
insert into public.expense_types (code, name)
select v.code, v.name
from (values
  ('РД1', 'Продукты и поставщики'),
  ('РД2', 'Маркетинг и реклама'),
  ('РД3', 'Зарплата'),
  ('РД4', 'Налоги'),
  ('РД8', 'Оборудование и ремонт'),
  ('РД9', 'Административные')
) as v (code, name)
where not exists (select 1 from public.expense_types t where t.code = v.code);

insert into public.expense_types (code, name, parent_id)
select v.code, v.name,
       (select id from public.expense_types p where p.code = v.parent_code limit 1)
from (values
  ('РД1/1', 'Мясо и птица',          'РД1'),
  ('РД1/2', 'Овощи и фрукты',        'РД1'),
  ('РД1/3', 'Бакалея',               'РД1'),
  ('РД1/4', 'Напитки',               'РД1'),
  ('РД2/1', 'Instagram / SMM',       'РД2'),
  ('РД2/2', 'Полиграфия и баннеры',  'РД2'),
  ('РД3/1', 'ФОТ Душанбе',           'РД3'),
  ('РД3/2', 'ФОТ Марказ',            'РД3'),
  ('РД3/3', 'ФОТ Fly Garden',        'РД3'),
  ('РД8/1', 'Ремонт оборудования',   'РД8'),
  ('РД8/3', 'Новое оборудование',    'РД8'),
  ('РД9/5', 'Оплаты гос структурам', 'РД9'),
  ('РД9/6', 'Канцелярия и связь',    'РД9')
) as v (code, name, parent_code)
where not exists (select 1 from public.expense_types t where t.code = v.code);
