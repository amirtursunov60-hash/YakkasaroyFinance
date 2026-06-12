import { BillsScreen } from "./BillsScreen";

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
  return <BillsScreen kind="supply" ui={UI} />;
}
