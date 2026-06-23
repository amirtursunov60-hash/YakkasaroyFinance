-- Снятие жёсткого UNIQUE «одна оплата на заявку» (fp_register_request_payment_uniq,
-- миграция 20260615184000) — он несовместим с отменой оплаты (20260623140000):
--   • компенсирующая запись отмены — тоже 'request_payment' по той же заявке;
--   • после отмены заявка возвращается в 'approved' и её можно оплатить заново.
-- Обе ситуации создают второй 'request_payment' по той же заявке → ошибка
-- "duplicate key value violates unique constraint fp_register_request_payment_uniq".
--
-- Защита от ДВОЙНОЙ оплаты сохраняется на основном механизме fp_pay_request
-- (та же миграция 20260615184000): пессимистичная блокировка строки заявки
-- FOR UPDATE + условный перевод 'approved'→'paid' с проверкой rowcount. Оплатить
-- можно только 'approved'-заявку; отмена возвращает её в 'approved' осознанно,
-- поэтому повторная оплата легитимна.

drop index if exists public.fp_register_request_payment_uniq;
