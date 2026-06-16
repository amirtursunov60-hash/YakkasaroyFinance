-- ============================================================================
-- Оргсхема (ТЗ v2 §4.3–4.4): расширение org_divisions / org_positions под
-- полную организующую схему (ЦКП, секции, шляпы, флаг руководящего поста) +
-- статус шляпы у назначения, и сидинг стартовой структуры из прототипа
-- (src/data/org.js) — по принципу №7 ТЗ это реальные стартовые данные.
--
-- RLS уже задан в baseline (read_all + admin_write):
--   org_divisions       — пишет is_fin_admin();
--   org_positions       — пишет is_fin_admin() OR ops_director;
--   position_assignments — пишет is_fin_admin() OR ops_director.
-- Новые колонки наследуют существующие политики.
-- ============================================================================

-- --- Отделения: цвет, ЦКП, идемпотентный ключ ------------------------------
alter table public.org_divisions add column if not exists color text;
alter table public.org_divisions add column if not exists ckp text;

-- code 1..7 уникален — natural key для идемпотентного сидинга
do $$ begin
  alter table public.org_divisions add constraint org_divisions_code_key unique (code);
exception when duplicate_table or duplicate_object then null; end $$;

-- --- Посты: секция, ЦКП поста, статистика, обязанности, руководящий пост ----
alter table public.org_positions add column if not exists section text;
alter table public.org_positions add column if not exists ckp text;
alter table public.org_positions add column if not exists statistic text;
alter table public.org_positions add column if not exists duties jsonb not null default '[]'::jsonb;
alter table public.org_positions add column if not exists is_executive boolean not null default false;
alter table public.org_positions add column if not exists sort integer not null default 0;

-- --- Статус шляпы у назначения (отметка «изучил» per person/post) -----------
do $$ begin
  create type public.hat_status as enum ('none', 'learning', 'done');
exception when duplicate_object then null; end $$;

alter table public.position_assignments
  add column if not exists hat_status public.hat_status not null default 'none';

-- ============================================================================
-- Сидинг: 7 отделений
-- ============================================================================
insert into public.org_divisions (code, name, color, ckp, sort) values
  ('7', 'Административное',           '#e8911c', 'Процветающая и расширяющаяся компания', 10),
  ('1', 'Персонал и коммуникации',   '#d6c14a', 'Компания, укомплектованная продуктивными сотрудниками', 20),
  ('2', 'Маркетинг и распространение','#3f9e6a', 'Поток заявок и броней на банкеты', 30),
  ('3', 'Финансы',                   '#5bd6c9', 'Сохранённые и приумноженные активы, учтённые финансы', 40),
  ('4', 'Производство',              '#5b8def', 'Проведённые банкеты и довольные гости', 50),
  ('5', 'Квалификация',              '#9c6ade', 'Обученные сотрудники, восстановленное качество продукта', 60),
  ('6', 'Публика',                   '#d64ad6', 'Новые и повторные гости, хорошая репутация', 70)
on conflict (code) do update set
  name = excluded.name, color = excluded.color, ckp = excluded.ckp, sort = excluded.sort;

-- ============================================================================
-- Сидинг: посты (code/outer_id = id прототипа для идемпотентности).
-- ЦКП/статистика/обязанности — из HAT_LIB прототипа, где заданы.
-- ============================================================================
insert into public.org_positions
  (code, name, division_id, section, ckp, statistic, duties, is_executive, sort, outer_id)
values
  -- Отделение 7 · Административное
  ('p70','Генеральный директор',     (select id from public.org_divisions where code='7'), 'Офис учредителя',
    'Жизнеспособная, растущая сеть Яккасарой', 'ВД сети',
    '["Задаёт цели и стратегию сети","Утверждает Директиву и крупные расходы","Назначает и снимает руководителей","Держит внимание на статистиках отделений","Ведёт ключевые переговоры (аренда, стройка, партнёры)"]'::jsonb,
    true, 10, 'p70'),
  ('p71','Операционный директор',    (select id from public.org_divisions where code='7'), 'Офис учредителя',
    null, null, '[]'::jsonb, false, 20, 'p71'),
  ('p72','Юрист',                    (select id from public.org_divisions where code='7'), 'Юридический отдел',
    'Юридически защищённая компания без штрафов и исков', 'Закрытые юр. вопросы за неделю',
    '["Договоры с поставщиками и арендодателями","Сопровождение проверок госорганов","Регистрация точек и лицензии","Претензии и иски"]'::jsonb,
    false, 30, 'p72'),
  ('p73','Начальник адм. отдела',    (select id from public.org_divisions where code='7'), 'Юридический отдел',
    null, null, '[]'::jsonb, false, 40, 'p73'),

  -- Отделение 1 · Персонал и коммуникации
  ('p10','Руководитель отделения',   (select id from public.org_divisions where code='1'), 'Отдел найма',
    'Закрытые вакансии продуктивными сотрудниками', 'Нанято и введено в должность',
    '["Поиск и собеседование кандидатов","Ввод в должность и контроль шляп","Кадровый документооборот","Внутренние коммуникации сети"]'::jsonb,
    true, 10, 'p10'),
  ('p11','HR-менеджер',              (select id from public.org_divisions where code='1'), 'Отдел найма',
    null, null, '[]'::jsonb, false, 20, 'p11'),
  ('p12','Офис-менеджер / ресепшн',  (select id from public.org_divisions where code='1'), 'Отдел коммуникаций',
    null, null, '[]'::jsonb, false, 30, 'p12'),

  -- Отделение 2 · Маркетинг и распространение
  ('p20','Руководитель отдела продаж',(select id from public.org_divisions where code='2'), 'Отдел продаж банкетов',
    null, null, '[]'::jsonb, true, 10, 'p20'),
  ('p21','Менеджер по банкетам',     (select id from public.org_divisions where code='2'), 'Отдел продаж банкетов',
    'Заключённые договоры на банкеты', 'Подписанные брони, сумма предоплат',
    '["Обработка входящих заявок","Показы залов и расчёт смет","Договоры и предоплаты","Передача брони в производство"]'::jsonb,
    false, 20, 'p21'),
  ('p22','SMM-менеджер',             (select id from public.org_divisions where code='2'), 'Отдел маркетинга',
    'Поток обращений из соцсетей', 'Заявки из Instagram, прирост подписчиков',
    '["Контент-план и съёмки","Ведение Instagram всех точек","Таргетированная реклама","Ответы в директ и передача лидов в продажи"]'::jsonb,
    false, 30, 'p22'),

  -- Отделение 3 · Финансы
  ('p30','Финансовый директор',      (select id from public.org_divisions where code='3'), 'Финансовый офис',
    null, null, '[]'::jsonb, true, 10, 'p30'),
  ('p31','Бухгалтер (Душанбе)',      (select id from public.org_divisions where code='3'), 'Финансовый офис',
    'Точный учёт: ни одна копейка не пропала', 'Сведённые без расхождений периоды',
    '["Ввод фактических остатков в Контроль средств","Проведение оплат по одобренным заявкам","Сверка касс точек","Налоговая отчётность"]'::jsonb,
    false, 20, 'p31'),
  ('p32','Бухгалтер (Худжанд)',      (select id from public.org_divisions where code='3'), 'Финансовый офис',
    null, null, '[]'::jsonb, false, 30, 'p32'),
  ('p33','Старший кассир',           (select id from public.org_divisions where code='3'), 'Касса',
    'Сданная без расхождений касса', 'Инкассации без недостач',
    '["Приём выручки точек","Инкассация и выдача под отчёт","Кассовая дисциплина"]'::jsonb,
    false, 40, 'p33'),

  -- Отделение 4 · Производство
  ('p40','Шеф-повар',                (select id from public.org_divisions where code='4'), 'Кухня',
    'Вкусные блюда вовремя при норме себестоимости', 'Банкеты без срывов, фудкост %',
    '["Меню банкетов и тех-карты","Закуп через заявки на ФП","Контроль кухонь всех точек","Обучение поваров"]'::jsonb,
    true, 10, 'p40'),
  ('p41','Су-шеф',                   (select id from public.org_divisions where code='4'), 'Кухня',
    null, null, '[]'::jsonb, false, 20, 'p41'),
  ('p42','Администратор ВИП/Люкс',   (select id from public.org_divisions where code='4'), 'Залы',
    'Проведённый без сбоев банкет, довольный заказчик', 'Банкеты без жалоб',
    '["Подготовка зала к мероприятию","Управление официантами на банкете","Решение вопросов гостей на месте","Передача смены и отчёт"]'::jsonb,
    false, 30, 'p42'),
  ('p43','Администратор Fly Garden', (select id from public.org_divisions where code='4'), 'Залы',
    null, null, '[]'::jsonb, false, 40, 'p43'),
  ('p44','Техник',                   (select id from public.org_divisions where code='4'), 'Техслужба',
    null, null, '[]'::jsonb, false, 50, 'p44'),

  -- Отделение 5 · Квалификация
  ('p50','Менеджер по обучению',     (select id from public.org_divisions where code='5'), 'Отдел обучения',
    null, null, '[]'::jsonb, true, 10, 'p50'),
  ('p51','Наставник официантов',     (select id from public.org_divisions where code='5'), 'Отдел обучения',
    null, null, '[]'::jsonb, false, 20, 'p51'),

  -- Отделение 6 · Публика
  ('p60','Менеджер по работе с гостями',(select id from public.org_divisions where code='6'), 'Работа с гостями',
    null, null, '[]'::jsonb, true, 10, 'p60'),
  ('p61','Хостес',                   (select id from public.org_divisions where code='6'), 'Работа с гостями',
    'Гость, встреченный так, что хочет вернуться', 'Положительные отзывы',
    '["Встреча и сопровождение гостей","Сбор отзывов после мероприятий","Книга повторных контактов"]'::jsonb,
    false, 20, 'p61')
on conflict (outer_id) do update set
  code = excluded.code, name = excluded.name, division_id = excluded.division_id,
  section = excluded.section, ckp = excluded.ckp, statistic = excluded.statistic,
  duties = excluded.duties, is_executive = excluded.is_executive, sort = excluded.sort;
