-- ============================================================================
-- Аватары: разрешить администраторам (is_fin_admin — владелец/финдиректор)
-- ставить аватар любому сотруднику. Раньше загрузка/замена в бакете avatars
-- была разрешена только в свою папку (по uid); теперь — ещё и админам в любую.
-- ============================================================================
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_fin_admin()));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_fin_admin()));
