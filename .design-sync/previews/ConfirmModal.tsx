// Превью ConfirmModal — тематический модал подтверждения (замена window.confirm).
// Оверлей-компонент: в конфиге задан cardMode "single" + viewport.
import { ConfirmModal } from "yakkasaroy-management";

export function Danger() {
  return (
    <ConfirmModal
      title="Удалить счёт поставщика?"
      message="Действие необратимо. Счёт и его вложения будут удалены из периода."
      confirmLabel="Удалить"
      tone="danger"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

export function Default() {
  return (
    <ConfirmModal
      title="Провести Директиву?"
      message="Недельный период будет закрыт — операции в нём станут недоступны."
      confirmLabel="Провести"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}
