import { useState } from "react";
import { Database } from "lucide-react";
import { BillsScreen } from "./BillsScreen";
import { MjPanel } from "../manajet/MjPanel";
import { useTheme } from "../../theme/theme";

// Счета поставщиков: фирмы, поставляющие продукты и хозтовары (ТЗ v2 §4.1.6)
const UI_SUPPLY = {
  heroLabel: "Счета поставщиков · продукты и хозтовары",
  addBtn: "Добавить счёт",
  formTitle: "Счёт поставщика",
  cpLabel: "Поставщик",
  cpRequired: "Выберите поставщика",
  newCpPlaceholder: "…или новый поставщик",
  emptyText: "Счетов на этой неделе нет — добавьте первый кнопкой выше",
  recurringLabel: "Повторяющийся счёт (регулярные поставки) — после оплаты можно продублировать",
};

// Обязательства: долги за оборудование, услуги, ремонт — раньше отдельный пункт
// меню, теперь второй режим этой же вкладки (механика общая, BillsScreen).
const UI_OBLIGATION = {
  heroLabel: "Обязательства · оборудование, услуги, ремонт",
  addBtn: "Добавить обязательство",
  formTitle: "Обязательство",
  cpLabel: "Кредитор / исполнитель",
  cpRequired: "Выберите кредитора или исполнителя",
  newCpPlaceholder: "…или новая фирма / исполнитель",
  emptyText: "Обязательств на этой неделе нет — добавьте первое кнопкой выше",
  recurringLabel: "Повторяющееся обязательство (аренда, рассрочка) — после оплаты можно продублировать",
};

// Один ряд переключателей вкладки: Счета поставщиков · Обязательства · ManaJet.
// ManaJet — общий мираж счетов (mj_bills, без деления на вид). На телефоне
// кнопки переносятся, чтобы не вылезать за край.
function BillsViewToggle({ view, setView }) {
  const { st } = useTheme();
  const opt = (key, label, icon) => (
    <button style={{ ...st.viewBtn, whiteSpace: "nowrap", ...(view === key ? st.viewBtnOn : {}) }}
      onClick={() => setView(key)}>{icon}{label}</button>
  );
  return (
    <div style={{ ...st.viewToggle, flexWrap: "wrap", marginBottom: 14 }}>
      {opt("supply", "Счета поставщиков")}
      {opt("obligation", "Обязательства")}
      {opt("manajet", "ManaJet", <Database size={13} />)}
    </div>
  );
}

export function Suppliers() {
  const [view, setView] = useState("supply");   // supply | obligation | manajet
  return (<>
    <BillsViewToggle view={view} setView={setView} />
    {view === "manajet"
      ? <MjPanel kind="bills" hideSwitch />
      : <BillsScreen kind={view} ui={view === "supply" ? UI_SUPPLY : UI_OBLIGATION} />}
  </>);
}
