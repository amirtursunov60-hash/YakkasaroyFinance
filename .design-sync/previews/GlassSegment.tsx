// Превью GlassSegment — стеклянный сегмент-контрол со скользящей пилюлей.
// Контролируемый компонент: оборачиваем в локальный state.
import { useState } from "react";
import { GlassSegment } from "yakkasaroy-management";

export function Periods() {
  const [v, setV] = useState("week");
  return (
    <GlassSegment
      ariaLabel="Период"
      options={[
        { value: "week", label: "Неделя" },
        { value: "month", label: "Месяц" },
        { value: "quarter", label: "Квартал" },
      ]}
      value={v}
      onChange={setV}
    />
  );
}

export function SmallTwoUp() {
  const [v, setV] = useState("ours");
  return (
    <GlassSegment
      size="sm"
      ariaLabel="Источник данных"
      options={[
        { value: "ours", label: "Наши данные" },
        { value: "manajet", label: "ManaJet" },
      ]}
      value={v}
      onChange={setV}
    />
  );
}
