-- Папки фондов как карточки (docs/funds-spec.md §9): цвет-метка, описание, архив.
-- RLS уже есть (admin_write = is_fin_admin, чтение всем) — не трогаем.
-- Архивирование папки на клиенте: funds.folder_id → null у фондов внутри,
-- затем fund_folders.is_archived = true (фонды остаются, без папки).
alter table public.fund_folders add column if not exists color text;
alter table public.fund_folders add column if not exists description text;
alter table public.fund_folders add column if not exists is_archived boolean not null default false;

comment on column public.fund_folders.color is 'Цвет-метка папки (пресет палитры темы)';
comment on column public.fund_folders.description is 'Описание папки/раздела';
comment on column public.fund_folders.is_archived is 'Архив вместо удаления (фонды при архиве папки остаются, folder_id → null)';
