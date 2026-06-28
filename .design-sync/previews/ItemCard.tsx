// Превью ItemCard — раскрывающаяся карточка заявки/счёта на экране финкомитета.
// Шапка: №, статья/контрагент, сумма, статус; тело — поля ЗРС (данные → ситуация
// → решение), фонд-источник, неделя ФП. `C`/`st`/`statusMeta` берём из темы
// (statusMeta — из экспортируемого `reqStatusMeta`).
import { useState } from "react";
import { ItemCard, reqStatusMeta, RequesterAvatar, useTheme } from "yakkasaroy-management";

// Реалистичная ЗРС-заявка от поста оргсхемы (одобрена, ждёт оплаты).
const approvedRequest = {
  id: "req-1",
  number: 142,
  status: "approved",
  planned_amount: 18500,
  approved_amount: 18500,
  paid_amount: 0,
  expense_type: { code: "РД4.2", name: "Кухонный инвентарь" },
  position: { code: "2.3", name: "Шеф-повар" },
  requester: { full_name: "Фируз Назаров" },
  location: { name: "Душанбе · центр" },
  fund: { code: "ФД4", name: "Развитие" },
  currency: { code: "TJS" },
  period: { starts_on: "2026-06-25", ends_on: "2026-07-01" },
  created_at: "2026-06-26T09:14:00Z",
  purpose: "Замена изношенного теплового оборудования на горячем цехе",
  csw_situation: "Две из четырёх плит вышли из строя, нагрузка на банкетную неделю выросла, кухня не успевает к выдаче.",
  csw_data: "Счёт поставщика «Технопарк» на 18 500 смони, срок поставки 3 дня, гарантия 12 мес.",
  csw_solution: "Закупить две индукционные плиты из фонда ФД4 «Развитие», ввести в строй до пятницы.",
  tags: ["кухня", "оборудование"],
};

// На доработке — видна заметка финкомитета и метки.
const revisionRequest = {
  id: "req-2",
  number: 138,
  status: "revision",
  planned_amount: 6400,
  approved_amount: null,
  paid_amount: 0,
  expense_type: { code: "РД7.1", name: "Маркетинг и реклама" },
  position: { code: "5.2", name: "Маркетолог" },
  requester: { full_name: "Малика Саидова" },
  location: { name: "Худжанд" },
  fund: { code: "ФД6", name: "Продвижение" },
  currency: { code: "TJS" },
  period: { starts_on: "2026-06-25", ends_on: "2026-07-01" },
  created_at: "2026-06-24T16:40:00Z",
  rejection_reason: "Уточните охват и приложите смету подрядчика — без цифр решение не принять.",
  purpose: "Таргетированная кампания к открытию летней террасы",
  csw_situation: "Посадка на террасе в будни проседает, нужен приток гостей к выходным.",
  csw_data: "Подрядчик предлагает 3 недели таргета, бюджет 6 400 смони.",
  csw_solution: "Запустить кампанию из фонда ФД6 «Продвижение» на 3 недели.",
  tags: ["реклама", "терраса"],
};

export function Approved() {
  const { C, st } = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <ItemCard
      C={C}
      st={st}
      item={approvedRequest}
      itemKind="request"
      isExpanded={open}
      onToggle={() => setOpen((o) => !o)}
      statusMeta={reqStatusMeta(C)}
      profileId="preview"
      avatar={<RequesterAvatar requester={approvedRequest.requester} />}
    />
  );
}

export function OnRevision() {
  const { C, st } = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <ItemCard
      C={C}
      st={st}
      item={revisionRequest}
      itemKind="request"
      isExpanded={open}
      onToggle={() => setOpen((o) => !o)}
      statusMeta={reqStatusMeta(C)}
      profileId="preview"
      avatar={<RequesterAvatar requester={revisionRequest.requester} />}
    />
  );
}
