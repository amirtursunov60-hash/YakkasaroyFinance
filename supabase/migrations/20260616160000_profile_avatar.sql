-- ============================================================================
-- Аватар сотрудника (раздел «Сотрудники»): ссылка на изображение в profiles +
-- публичный бакет хранилища `avatars`. Загрузка/замена — только в свою папку
-- (имя объекта начинается с uid пользователя). Чтение — публичное.
--
-- Менять avatar_url пользователь может сам: политика profiles_self из baseline
-- разрешает self-update, пока не меняются role/is_active.
-- ============================================================================
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$ begin
  create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy avatars_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy avatars_update on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
