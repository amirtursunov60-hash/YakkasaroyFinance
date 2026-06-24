-- Следствия Supabase security advisor (2026-06-24).
--
-- 1) Триггер-функции, добавленные ПОСЛЕ хардерINGа 20260612165208, не были
--    отозваны у public/anon/authenticated и торчали как вызываемые RPC
--    (/rest/v1/rpc/...). Возвращаем конвенцию: триггер-функциям нечего делать
--    в публичном API. Риск низкий (прямой вызов упал бы на NEW/TG), но это
--    нарушение собственной модели прав и шум в адвайзоре.
revoke execute on function public.trg_bill_approve_funds_check()    from public, anon, authenticated;
revoke execute on function public.trg_request_approve_funds_check() from public, anon, authenticated;
revoke execute on function public.trg_request_period_open_check()   from public, anon, authenticated;

-- 2) Бакет avatars (публичный): политика avatars_read давала роли public
--    широкий SELECT (bucket_id='avatars'), что позволяло листинг ВСЕХ файлов.
--    Доступ к аватарам во фронте идёт через getPublicUrl (публичный бакет —
--    SELECT не требуется, в т.ч. для чужих аватаров), поэтому сужаем SELECT до
--    своей папки + финадмина и убираем доступ для anon.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (auth.uid())::text or is_fin_admin())
  );

-- ПРИМЕЧАНИЕ: перенос расширения pg_net из public НЕ делаем — на нём висит
-- cron-задача (ночной вызов edge-функции), перенос сломал бы её. Оставлено
-- осознанно; WARN адвайзора по pg_net принимаем.
