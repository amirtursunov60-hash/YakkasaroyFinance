// Превью MjSwitch — сегментированный переключатель источника «Наши данные / ManaJet».
// Контролируемый компонент: оборачиваем в локальный state.
import { useState } from "react";
import { MjSwitch } from "yakkasaroy-management";

export function Ours() {
  const [src, setSrc] = useState("ours");
  return <MjSwitch src={src} setSrc={setSrc} />;
}

export function ManaJet() {
  const [src, setSrc] = useState("manajet");
  return <MjSwitch src={src} setSrc={setSrc} />;
}
