-- Таймлайн по лиду (gap-map CRM §16). Историю изменений лида ведём через
-- существующий механизм audit_log + trg_audit (как у payment_requests/incomes и др.),
-- которого на crm_leads ещё не было. Плюс — ТОЧЕЧНАЯ политика чтения: audit_log
-- виден только финадминам (содержит финданные), а историю лида должны видеть и
-- CRM-менеджеры. Добавляем отдельную SELECT-политику ТОЛЬКО для строк crm_leads и
-- только для лидов, видимых пользователю (паттерн EXISTS-on-parent: подзапрос к
-- crm_leads сам проходит через его RLS). Прочий audit_log остаётся закрытым.

-- история изменений лида в общий журнал
drop trigger if exists audit_crm_leads on public.crm_leads;
create trigger audit_crm_leads after insert or update or delete on public.crm_leads
  for each row execute function public.trg_audit();

-- точечное чтение истории лида (не открывает остальной audit_log)
drop policy if exists audit_read_crm_leads on public.audit_log;
create policy audit_read_crm_leads on public.audit_log as permissive for select to public
  using (
    table_name = 'crm_leads'
    and exists (select 1 from public.crm_leads l where l.id::text = audit_log.record_id)
  );
