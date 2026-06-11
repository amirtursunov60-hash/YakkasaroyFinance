
export const DDS_IN = [842, 910, 905, 1010, 1015, 990, 1080, 1100];

export const DDS_OUT = [780, 845, 950, 880, 930, 1020, 905, 940];

export const DDS_CATS = {
  income: [
    { label: "Предоплаты банкетов", v: 1480 },
    { label: "Доплаты в день банкета", v: 2240 },
    { label: "Ежедневная выручка Фемали", v: 940 },
    { label: "Кейтринг", v: 196 },
  ],
  outcome: [
    { label: "Продукты и поставщики", v: 1651 },
    { label: "ФОТ", v: 1165 },
    { label: "Аренда и коммунальные", v: 730 },
    { label: "Налоги", v: 388 },
    { label: "Прочее и административные", v: 152 },
    { label: "Оборудование и ремонт", v: 121 },
    { label: "Маркетинг", v: 96 },
  ],
};

export const PNL_ROWS = [
  { label: "Выручка", v: 4856, bold: true },
  { label: "Себестоимость (продукты)", v: -1651 },
  { label: "Валовая прибыль", v: 3205, bold: true, accent: true },
  { label: "ФОТ", v: -1165 },
  { label: "Аренда", v: -410 },
  { label: "Коммунальные", v: -320 },
  { label: "Маркетинг", v: -96 },
  { label: "Административные", v: -152 },
  { label: "EBITDA", v: 1062, bold: true, accent: true },
  { label: "Налоги", v: -388 },
  { label: "Чистая прибыль", v: 674, bold: true, accent: true },
];

export const POINTS_PNL = [
  { name: "Душанбе Яккасарой", rev: 1899, exp: 1466 },
  { name: "Флай гарден", rev: 884, exp: 701 },
  { name: "Фемали 1", rev: 738, exp: 627 },
  { name: "Яккасарой Марказ", rev: 642, exp: 533 },
  { name: "Фемали 2 Марказ", rev: 512, exp: 459 },
  { name: "Кейтринг", rev: 181, exp: 144 },
];
