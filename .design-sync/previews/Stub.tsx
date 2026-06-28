// Превью Stub — плейсхолдер «раздел в разработке» с подписью.
import { Stub } from "yakkasaroy-management";

export function Default() {
  return <Stub label="Отчёты по фондам" />;
}

export function Variants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Stub label="Сверка расчётных счетов" />
      <Stub label="Боевое планирование" />
    </div>
  );
}
