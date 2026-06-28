// Превью ConfirmModal — тематический модал подтверждения (замена window.confirm).
// Оверлей модала — position:fixed. Оборачиваем в контейнер с `transform`:
// он становится containing-block для fixed-потомков, поэтому оверлей
// центрируется ВНУТРИ карточки (а не по всему вьюпорту) и виден целиком.
import { ConfirmModal } from "yakkasaroy-management";

const stage: React.CSSProperties = {
  transform: "translateZ(0)",
  position: "relative",
  height: 300,
  width: "100%",
};

export function Danger() {
  return (
    <div style={stage}>
      <ConfirmModal
        title="Удалить счёт поставщика?"
        message="Действие необратимо. Счёт и его вложения будут удалены из периода."
        confirmLabel="Удалить"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </div>
  );
}

export function Default() {
  return (
    <div style={stage}>
      <ConfirmModal
        title="Провести Директиву?"
        message="Недельный период будет закрыт — операции в нём станут недоступны."
        confirmLabel="Провести"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </div>
  );
}
