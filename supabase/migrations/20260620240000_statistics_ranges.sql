-- ============================================================================
--  Коридор состояний у статистик (фикс из docs/manajet-анализ-и-интеграция.md §B5)
--  и поля для импорта определений статистик из ManaJet по outer_id.
--
--  В ManaJet у Stat есть min_val/max_val (целевой коридор), stat_type (тип) и
--  sign (направление «вверх = хорошо»). У нас этих полей не было — состояния ХМС
--  (Власть/Норма/Опасность) не на чём настраивать. Добавляем их в statistics.
--  Идемпотентно. Денежных триггеров на statistics нет — RLS из baseline.
-- ============================================================================

alter table public.statistics add column if not exists min_val   numeric;
alter table public.statistics add column if not exists max_val   numeric;
alter table public.statistics add column if not exists stat_type integer;
alter table public.statistics add column if not exists sign      boolean;
alter table public.statistics add column if not exists source    text;

comment on column public.statistics.min_val   is 'Нижняя граница целевого коридора (ManaJet Stat.min_val)';
comment on column public.statistics.max_val   is 'Верхняя граница целевого коридора (ManaJet Stat.max_val)';
comment on column public.statistics.stat_type is 'Тип статистики ManaJet (Stat.stat_type): 1=счётная, 8=доход, 11=дивиденд, 12=активы/резервы …';
comment on column public.statistics.sign      is 'Направление: true = рост желателен (ManaJet Stat.sign)';
comment on column public.statistics.source    is 'Источник записи: manual | manajet';
