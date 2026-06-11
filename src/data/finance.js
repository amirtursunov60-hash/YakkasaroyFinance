
// ---------------------------------------------------------------- DATA
export const FUND_LEVELS = [
  { id: "revenue", title: "Выручка", total: 0, fundsTitle: "Фонды выручки", funds: [
    { code: "FD1", name: "Поставщики и Фирмы", available: 1540.6, pct: 5 },
    { code: "FD1/1", name: "Поставщики доп услуги", available: 1584.65, pct: 5 },
    { code: "FD2", name: "Хизматрасони", available: 20508.17, pct: 15 },
    { code: "FD6", name: "Фонд Резервов", available: 107265.54, pct: 10 },
  ]},
  { id: "margin", title: "Маржинальный доход", total: 0, fundsTitle: "Фонды маржинального дохода", funds: [
    { code: "FD3", name: "Фонд зарплаты", available: 59661.09, pct: 25 },
    { code: "FD3/3", name: "Флай Гарден", available: 16438.45, pct: 5 },
    { code: "FD4", name: "Налог", available: 58524.0, pct: 12 },
    { code: "FD5", name: "Фонд учредителей", available: 220872.58, pct: 20 },
    { code: "FD6", name: "Фонд Резервов", available: 43837.04, pct: 8 },
    { code: "FD7", name: "Строительный", available: 5974.16, pct: 5 },
    { code: "FD8", name: "Комунальные Услуги", available: 92490.69, pct: 15 },
    { code: "FD9", name: "Процент Руководителям", available: 31153.18, pct: 10 },
  ]},
  { id: "adjusted", title: "Скорректированный доход", total: 741971, fundsTitle: "Фонды скорректированного дохода", funds: [
    { code: "FD9/1", name: "Развитие", available: 1877.02, pct: 10 },
  ]},
];


export const INCOME_TREE = [
  { id: 14, code: "D1", name: "Душанбе Яккасарой", type: "folder", color: "#e8911c", prev: 1112060.2, cur: 0, children: [
    { id: 11, code: "D1/1", name: "ВИП зал", type: "leaf", color: "#7bd88f", prev: 315442, cur: 0 },
    { id: 12, code: "D1/2", name: "ВИП Доп стол", type: "leaf", color: "#e0463b", prev: 22600, cur: 0 },
    { id: 9, code: "D1/3", name: "ЛЮКС зал", type: "leaf", color: "#5bd6c9", prev: 471109.2, cur: 0 },
    { id: 6, code: "D1/4", name: "Люкс Доп стол", type: "leaf", color: "#2f9e44", prev: 0, cur: 0 },
    { id: 8, code: "D1/5", name: "Оши нахор ВИП Зал", type: "leaf", color: "#d6c14a", prev: 126460, cur: 0 },
    { id: 1, code: "D1/6", name: "Оши Нахор Люкс", type: "leaf", color: "#e0463b", prev: 97849, cur: 0 },
    { id: 32, code: "D1/7", name: "Оформление", type: "leaf", color: "#e8911c", prev: 68600, cur: 0 },
    { id: 7, code: "D1/8", name: "Видео камера Душанбе", type: "leaf", color: "#9c6ade", prev: 0, cur: 0 },
    { id: 3, code: "D1/9", name: "Торт Душанбе", type: "leaf", color: "#7bd88f", prev: 10000, cur: 0 },
  ]},
  { id: 35, code: "D1.1", name: "Яккасарой Марказ", type: "folder", color: "#e8911c", prev: 310760, cur: 0, children: [
    { id: 34, code: "D1/1/1", name: "Grand Hall Марказ", type: "leaf", color: "#5bd6c9", prev: 261260, cur: 0 },
    { id: 38, code: "D1/1/2", name: "Grand доп стол", type: "leaf", color: "#d64ad6", prev: 0, cur: 0 },
    { id: 39, code: "D1/1/3", name: "Grand оши нахор", type: "leaf", color: "#7bd88f", prev: 16500, cur: 0 },
    { id: 40, code: "D1/1/4", name: "Поставщики услуг Grand", type: "leaf", color: "#5b8def", prev: 0, cur: 0 },
    { id: 41, code: "D1/1/5", name: "Торт grand", type: "leaf", color: "#5bd6c9", prev: 0, cur: 0 },
    { id: 42, code: "D1/1/6", name: "Оформление Grand", type: "leaf", color: "#e8911c", prev: 33000, cur: 0 },
  ]},
  { id: 25, code: "D1.2", name: "Флай гарден", type: "folder", color: "#e8911c", prev: 417452, cur: 0, children: [
    { id: 43, code: "D1/2/1", name: "Fly Garden Приходной", type: "leaf", color: "#7bd88f", prev: 380592, cur: 0 },
    { id: 44, code: "D1/2/2", name: "Оформление Fly Garden", type: "leaf", color: "#e8911c", prev: 32860, cur: 0 },
    { id: 45, code: "D1/2/3", name: "Торт Fly Garden", type: "leaf", color: "#5bd6c9", prev: 4000, cur: 0 },
  ]},
  { id: 29, code: "D1.3", name: "Фемали 1", type: "folder", color: "#e8911c", prev: 365178, cur: 0, children: [
    { id: 28, code: "D1/3/1", name: "Фемели", type: "leaf", color: "#7bd88f", prev: 365178, cur: 0 },
  ]},
  { id: 47, code: "D1.4", name: "Фемали 2 Марказ", type: "folder", color: "#e8911c", prev: 63811, cur: 45527, children: [
    { id: 33, code: "D1/4/1", name: "Фемали 2", type: "leaf", color: "#7bd88f", prev: 63811, cur: 45527 },
  ]},
  { id: 46, code: "D1.5", name: "Кейтринг", type: "folder", color: "#2f9e44", prev: 19400, cur: 0, children: [] },
  { id: 48, code: "D1.6", name: "Прямой фонд", type: "folder", color: "#d6c14a", prev: 22700, cur: 69000, children: [] },
];


// Заявки на финансирование (как в Manajet → Директива → Заявки)
export const PAY_METHODS = ["Наличные", "Перечисление", "Корпоративная карта"];

export const FUND_SOURCES = ["ФД4 — Налог Яккасарой", "ФД9/1 — Фонд Упр", "ФД7 — Строительный", "ФД3 — Фонд зарплаты", "ФД1 — Поставщики", "ФД6 — Резервы"];

export const REQUEST_GROUPS = [
  { id: "g7", code: "7", name: "Административное управление", color: "#e8911c", items: [
    { id: 13519, photo: 12, code: "РД4", title: "Налог на амвол ресторан Яккасарой", role: "7.20.1 Начальник, Нурматов Абдукаюм Чуракулович", kind: "РД4 — Налог на прибыль", amount: 72655, pay: "Наличные", fund: "ФД4 — Налог Яккасарой", status: "review", initials: "НА", tone: "#c46b3f" },
    { id: 13520, photo: 13, code: "РД9/5", title: "Оплата гос структуры", role: "7.20.1.1 Юрист, Чалолов Точиддин", kind: "РД9/5 — Оплата гос структуры", amount: 10981.3, pay: "Наличные", fund: "ФД9/1 — Фонд Упр", status: "review", initials: "ЧТ", tone: "#4a6fa5" },
    { id: 13521, photo: 33, code: "РД9/5", title: "Оплата гос структуры", role: "7.20.1.1 Юрист, Чалолов Точиддин", kind: "РД9/5 — Оплата гос структуры", amount: 7500, pay: "Наличные", fund: "ФД9/1 — Фонд Упр", status: "review", initials: "ЧТ", tone: "#4a6fa5" },
  ]},
  { id: "g1", code: "1", name: "Управление персонала и коммуникации", color: "#d6c14a", items: [
    { id: 13524, photo: 45, code: "РД8/3", title: "Кондиционер", role: "1.1 Руководитель, Боймурадова Мадина", kind: "РД8/3 — Оборудование нав", amount: 4000, pay: "Наличные", fund: "ФД7 — Строительный", status: "review", initials: "БМ", tone: "#a857a8" },
    { id: 13526, photo: 47, code: "РД2", title: "Реклама в Instagram", role: "1.4 SMM-менеджер, Рахимова Дилноза", kind: "РД2 — Маркетинг и реклама", amount: 3500, pay: "Корпоративная карта", fund: "ФД9/1 — Фонд Упр", status: "review", initials: "РД", tone: "#3f9e6a" },
  ]},
  { id: "g3", code: "3", name: "Производство и кухня", color: "#5b8def", items: [
    { id: 13530, photo: 14, code: "РД1", title: "Закуп мяса (поставщик Олими)", role: "3.2 Шеф-повар, Саидов Фаррух", kind: "РД1 — Продукты", amount: 28400, pay: "Перечисление", fund: "ФД1 — Поставщики", status: "review", initials: "СФ", tone: "#c46b3f" },
    { id: 13533, photo: 51, code: "РД8/1", title: "Ремонт пароконвектомата", role: "3.5 Техник, Назаров Бахтиёр", kind: "РД8/1 — Ремонт оборудования", amount: 6200, pay: "Наличные", fund: "ФД6 — Резервы", status: "review", initials: "НБ", tone: "#4a6fa5" },
  ]},
];


// Виды расхода (РД) — дерево по образцу Manajet «Расходы»
export const EXPENSE_TREE = [
  { id: 1, code: "РД1", name: "Продукты и поставщики", color: "#5b8def", prev: 96400, cur: 28400, children: [
    { id: 11, code: "РД1/1", name: "Мясо и птица", prev: 41200, cur: 28400 },
    { id: 12, code: "РД1/2", name: "Овощи и фрукты", prev: 18750, cur: 0 },
    { id: 13, code: "РД1/3", name: "Бакалея", prev: 22650, cur: 0 },
    { id: 14, code: "РД1/4", name: "Напитки", prev: 13800, cur: 0 },
  ]},
  { id: 2, code: "РД2", name: "Маркетинг и реклама", color: "#3f9e6a", prev: 9200, cur: 3500, children: [
    { id: 21, code: "РД2/1", name: "Instagram / SMM", prev: 6200, cur: 3500 },
    { id: 22, code: "РД2/2", name: "Полиграфия и баннеры", prev: 3000, cur: 0 },
  ]},
  { id: 3, code: "РД3", name: "Зарплата", color: "#d6c14a", prev: 118300, cur: 0, children: [
    { id: 31, code: "РД3/1", name: "ФОТ Душанбе", prev: 64500, cur: 0 },
    { id: 32, code: "РД3/2", name: "ФОТ Марказ", prev: 28400, cur: 0 },
    { id: 33, code: "РД3/3", name: "ФОТ Fly Garden", prev: 25400, cur: 0 },
  ]},
  { id: 4, code: "РД4", name: "Налоги", color: "#c46b3f", prev: 58524, cur: 72655, children: [] },
  { id: 5, code: "РД8", name: "Оборудование и ремонт", color: "#a857a8", prev: 14600, cur: 10200, children: [
    { id: 51, code: "РД8/1", name: "Ремонт оборудования", prev: 8400, cur: 6200 },
    { id: 52, code: "РД8/3", name: "Новое оборудование", prev: 6200, cur: 4000 },
  ]},
  { id: 6, code: "РД9", name: "Административные", color: "#4a6fa5", prev: 21300, cur: 18481.3, children: [
    { id: 61, code: "РД9/5", name: "Оплаты гос структурам", prev: 12100, cur: 18481.3 },
    { id: 62, code: "РД9/6", name: "Канцелярия и связь", prev: 9200, cur: 0 },
  ]},
];


// ---------------------------------------------------------------- CONTROL (сверка «факт vs расчёт» по ТЗ 3.1.8)
export const CONTROL_INIT = [
  { id: 1, name: "Касса Душанбе", cur: "TJS", value: "", calc: 48120.5 },
  { id: 2, name: "Касса Худжанд", cur: "TJS", value: "", calc: 12480 },
  { id: 3, name: "Расчётный счёт Алиф (TJS)", cur: "TJS", value: "", calc: 215640.75 },
  { id: 4, name: "Расчётный счёт Алиф (USD)", cur: "USD", value: "", calc: 8350 },
  { id: 5, name: "Fly Garden касса", cur: "TJS", value: "", calc: 9320 },
];
