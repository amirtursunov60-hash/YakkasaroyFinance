// Превью DecideModal — модал решения по заявке ЗРС / счёту поставщика
// (одобрить / отклонить / оплатить). Оверлей `position:fixed` — оборачиваем в
// контейнер с `transform`, чтобы fixed-оверлей центрировался ВНУТРИ карточки
// и был виден целиком (паттерн из ConfirmModal.tsx).
//
// DecideModal принимает оформление пропсами `C`/`st` (а не из контекста) —
// берём их из `useTheme()`, который уже даёт провайдер превью.
import { DecideModal, useTheme } from "yakkasaroy-management";

const stage: React.CSSProperties = {
  transform: "translateZ(0)",
  position: "relative",
  height: 460,
  width: "100%",
};

const tjs = { id: "cur-tjs", code: "TJS" };

// Открытые недели ФП (чт–ср) для выбора недели оплаты.
const periods = [
  { id: "wk-26", status: "open", starts_on: "2026-06-25", ends_on: "2026-07-01" },
  { id: "wk-25", status: "open", starts_on: "2026-06-18", ends_on: "2026-06-24" },
];

const funds = [
  { id: "fd2", code: "ФД2", name: "Фонд продвижения", balance: 18450 },
  { id: "fd4", code: "ФД4", name: "Фонд ремонта и оборудования", balance: 72300 },
  { id: "fd7", code: "ФД7", name: "Резервный фонд", balance: 145000 },
];

const accounts = [
  { id: "acc-cash", name: "Касса · Душанбе", currency_id: "cur-tjs" },
  { id: "acc-bank", name: "Алиф Банк · расчётный", currency_id: "cur-tjs" },
];

// Одобрение заявки ЗРС от поста оргсхемы — выбор фонда-источника.
export function ApproveRequest() {
  const { C, st } = useTheme();
  const decide = {
    itemKind: "request",
    action: "approve",
    item: {
      number: "142",
      planned_amount: 8600,
      approved_amount: 8600,
      paid_amount: 0,
      currency: tjs,
      expense_type: { name: "Закупка посуды для туйхоны" },
      fund: { id: "fd4" },
      period: periods[0],
    },
  };
  return (
    <div style={stage}>
      <DecideModal
        C={C}
        st={st}
        decide={decide}
        funds={funds}
        accounts={accounts}
        periods={periods}
        currentPeriodId="wk-26"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </div>
  );
}

// Оплата счёта поставщика (частично) — выбор счёта ДС, остаток к оплате.
export function PaySupplierBill() {
  const { C, st } = useTheme();
  const decide = {
    itemKind: "bill",
    action: "pay",
    item: {
      number: "А-0931",
      amount: 24500,
      paid_amount: 10000,
      currency: tjs,
      counterparty: { name: 'ООО «Сомон Агро» · овощи' },
      period: periods[0],
    },
  };
  return (
    <div style={stage}>
      <DecideModal
        C={C}
        st={st}
        decide={decide}
        funds={funds}
        accounts={accounts}
        periods={periods}
        currentPeriodId="wk-26"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </div>
  );
}
