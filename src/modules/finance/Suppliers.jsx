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

// Ряд переключателей: слева вид счетов (Счета поставщиков / Обязательства),
// рядом — источник данных (Наши данные / ManaJet).
function BillsToggleRow({ tab, setTab, src, setSrc }) {
  const { st } = useTheme();
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      <div style={st.viewToggle}>
        <button style={{ ...st.viewBtn, ...(tab === "supply" ? st.viewBtnOn : {}) }} onClick={() => setTab("supply")}>Счета поставщиков</button>
        <button style={{ ...st.viewBtn, ...(tab === "obligation" ? st.viewBtnOn : {}) }} onClick={() => setTab("obligation")}>Обязательства</button>
      </div>
      <div style={st.viewToggle}>
        <button style={{ ...st.viewBtn, ...(src === "ours" ? st.viewBtnOn : {}) }} onClick={() => setSrc("ours")}>Наши данные</button>
        <button style={{ ...st.viewBtn, ...(src === "manajet" ? st.viewBtnOn : {}) }} onClick={() => setSrc("manajet")}>
          <Database size={13} /> ManaJet
        </button>
      </div>
    </div>
  );
}

export function Suppliers() {
  const [src, setSrc] = useState("ours");
  const [tab, setTab] = useState("supply");   // supply | obligation
  // Источник ManaJet — общий мираж счетов (mj_bills, без деления на вид);
  // у MjPanel свой тумблер «Наши данные / ManaJet» для возврата.
  if (src === "manajet") return <MjPanel kind="bills" src={src} setSrc={setSrc} />;
  return (<>
    <BillsToggleRow tab={tab} setTab={setTab} src={src} setSrc={setSrc} />
    <BillsScreen kind={tab} ui={tab === "supply" ? UI_SUPPLY : UI_OBLIGATION} />
  </>);
}
