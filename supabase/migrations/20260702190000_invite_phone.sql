-- Телефон приглашаемого в приглашении — чтобы отправить ссылку-приглашение
-- сотруднику в WhatsApp/Telegram прямо из списка приглашений (вариант 1:
-- deep-ссылки, как в рассылках; шлюза нет). Поле необязательное, аддитивное.
alter table public.invites add column if not exists phone text;
comment on column public.invites.phone is
  'Телефон приглашаемого (для отправки ссылки в WhatsApp/Telegram). Необязательный.';
