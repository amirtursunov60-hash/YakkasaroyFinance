import { useState } from "react";
import { BillsScreen } from "./BillsScreen";
import { MjPanel, MjSwitch } from "../manajet/MjPanel";

// Счета поставщиков: фирмы, поставляющие продукты и хозтовары (ТЗ v2 §4.1.6)
const UI = {
  heroLabel: "Счета поставщиков · продукты и хозтовары",
  addBtn: "Добавить счёт",
  formTitle: "Счёт поставщика",
  cpLabel: "Поставщик",
  cpRequired: "Выберите поставщика",
  newCpPlaceholder: "…или новый поставщик",
  emptyText: "Счетов на этой неделе нет — добавьте первый кнопкой выше",
  recurringLabel: "Повторяющийся счёт (регулярные поставки) — после оплаты можно продублировать",
};

export function Suppliers() {
  const [src, setSrc] = useState("ours");
  if (src === "manajet") return <MjPanel kind="bills" src={src} setSrc={setSrc} />;
  return (<>
    <MjSwitch src={src} setSrc={setSrc} />
    <BillsScreen kind="supply" ui={UI} />
  </>);
}
