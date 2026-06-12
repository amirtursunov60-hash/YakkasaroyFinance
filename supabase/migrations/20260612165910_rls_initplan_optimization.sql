-- Оптимизация RLS (advisor: auth_rls_initplan, 11 политик).
-- auth.uid() / is_fin_admin() / my_role() обёрнуты в (select ...), чтобы
-- вычисляться один раз на запрос, а не на каждую строку. Логика не изменена.

-- profiles
drop policy profiles_self on public.profiles;
create policy profiles_self on public.profiles for update
  using ((id = (select auth.uid())) OR (select is_fin_admin()));

drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check ((id = (select auth.uid())) OR (select is_fin_admin()));

-- expense_types
drop policy etypes_read on public.expense_types;
create policy etypes_read on public.expense_types for select
  using ((select is_fin_admin()) OR (location_id IS NULL) OR has_location_access(location_id) OR (EXISTS ( SELECT 1
   FROM expense_type_access
  WHERE ((expense_type_access.user_id = (select auth.uid())) AND (expense_type_access.expense_type_id = expense_types.id)))));

-- payment_requests
drop policy requests_read on public.payment_requests;
create policy requests_read on public.payment_requests for select
  using (((requester_id = (select auth.uid())) OR holds_position(position_id) OR (select is_fin_admin()) OR (((select my_role()) = ANY (ARRAY['ops_director'::app_role, 'location_manager'::app_role])) AND has_location_access(location_id)) OR (((select my_role()) = 'accountant'::app_role) AND (status = ANY (ARRAY['approved'::request_status, 'paid'::request_status])))));

drop policy requests_insert on public.payment_requests;
create policy requests_insert on public.payment_requests for insert
  with check (((requester_id = (select auth.uid())) AND holds_position(position_id) AND has_location_access(location_id) AND (status = 'submitted'::request_status)));

drop policy requests_update on public.payment_requests;
create policy requests_update on public.payment_requests for update
  using (((select is_fin_admin()) OR (((select my_role()) = 'accountant'::app_role) AND (status = 'approved'::request_status)) OR ((requester_id = (select auth.uid())) AND (status = 'submitted'::request_status))));

-- request_attachments
drop policy req_attach_rw on public.request_attachments;
create policy req_attach_rw on public.request_attachments for all
  using (((uploaded_by = (select auth.uid())) OR (select is_fin_admin()) OR (EXISTS ( SELECT 1
   FROM payment_requests r
  WHERE ((r.id = request_attachments.request_id) AND (r.requester_id = (select auth.uid())))))))
  with check ((uploaded_by = (select auth.uid())));

-- request_comments
drop policy req_comments_insert on public.request_comments;
create policy req_comments_insert on public.request_comments for insert
  with check ((author_id = (select auth.uid())));

-- statistics
drop policy stats_read on public.statistics;
create policy stats_read on public.statistics for select
  using (((location_id IS NULL) OR has_location_access(location_id) OR (owner_id = (select auth.uid())) OR ((position_id IS NOT NULL) AND holds_position(position_id))));

-- statistic_values
drop policy statval_read on public.statistic_values;
create policy statval_read on public.statistic_values for select
  using ((EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND ((s.location_id IS NULL) OR has_location_access(s.location_id) OR (s.owner_id = (select auth.uid())) OR ((s.position_id IS NOT NULL) AND holds_position(s.position_id)))))));

drop policy statval_insert on public.statistic_values;
create policy statval_insert on public.statistic_values for insert
  with check ((((NOT is_quota) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND (s.owner_id = (select auth.uid()))))))) OR (is_quota AND ((select is_fin_admin()) OR ((select my_role()) = 'ops_director'::app_role)))));
