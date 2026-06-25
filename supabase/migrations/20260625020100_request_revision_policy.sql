-- Заявки §8 (продолжение): RLS, чтобы автор мог отредактировать и подать заново
-- заявку, возвращённую на доработку (status='revision').
--
-- Возврат на доработку делает финкомитет — обычным UPDATE (ветка is_fin_admin()
-- в requests_update уже это разрешает; в коде — decideRequest со status='revision'
-- и причиной в rejection_reason). Отдельный RPC не нужен.
--
-- А вот автору прежняя политика разрешала править свою заявку только пока она
-- 'submitted'. Расширяем ветку автора до status in ('submitted','revision'):
-- USING проверяется и для старой, и для новой строки (with_check у политики нет),
-- поэтому автор может перевести revision→submitted (подать заново) и править поля,
-- но НЕ выставить approved/paid/rejected/withdrawn (те значения USING не проходят).

alter policy requests_update on public.payment_requests
  using (
    (select is_fin_admin())
    or (((select my_role()) = 'accountant'::app_role) and (status = 'approved'::request_status))
    or ((requester_id = (select auth.uid())) and (status = any (array['submitted'::request_status, 'revision'::request_status])))
  );
