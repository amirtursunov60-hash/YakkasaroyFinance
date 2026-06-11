
// ---------------------------------------------------------------- CRM · ВОРОНКА БАНКЕТОВ (Этап 3 ТЗ)
export const CRM_STAGES = [
  { key: "new", label: "Новая заявка", color: "#5b8def" },
  { key: "show", label: "Показ зала", color: "#9c6ade" },
  { key: "offer", label: "Смета и КП", color: "#e8911c" },
  { key: "contract", label: "Договор и предоплата", color: "#5bd6c9" },
  { key: "won", label: "Банкет проведён", color: "#1fd65f" },
  { key: "lost", label: "Потеряна", color: "#ff6b5e" },
];

export const CRM_NEXT = { new: "show", show: "offer", offer: "contract", contract: "won" };


export const LEADS_SEED = [
  { id: 901, name: "Семья Ахмедовых", phone: "+992 93 500-12-34", event: "Свадьба", hall: "ЛЮКС зал", date: "18 июл", guests: 350, budget: 78000, stage: "new", source: "Instagram" },
  { id: 902, name: "Шарипова Мунира", phone: "+992 98 711-45-09", event: "Туй писар", hall: "Grand Hall Марказ", date: "25 июл", guests: 280, budget: 56000, stage: "new", source: "Рекомендация" },
  { id: 903, name: "ООО «Пайванд»", phone: "+992 44 600-22-00", event: "Корпоратив", hall: "Fly Garden", date: "03 июл", guests: 90, budget: 24000, stage: "show", source: "Звонок" },
  { id: 904, name: "Семья Мирзоевых", phone: "+992 90 123-77-81", event: "Свадьба", hall: "ВИП зал", date: "08 авг", guests: 400, budget: 96000, stage: "show", source: "Instagram" },
  { id: 905, name: "Раджабов Сухроб", phone: "+992 93 444-90-17", event: "Юбилей 50 лет", hall: "Фемали 1", date: "29 июн", guests: 120, budget: 21000, stage: "offer", source: "Проходил мимо" },
  { id: 906, name: "Семья Гафуровых", phone: "+992 91 808-33-65", event: "Оши нахор", hall: "ВИП зал", date: "21 июн", guests: 200, budget: 14500, stage: "offer", source: "Рекомендация" },
  { id: 907, name: "Семья Рахимовых", phone: "+992 92 555-18-42", event: "Свадьба", hall: "ЛЮКС зал", date: "20 июн", guests: 380, budget: 58000, stage: "contract", source: "Instagram" },
  { id: 908, name: "Азизов Фирдавс", phone: "+992 93 770-25-90", event: "Туй", hall: "Grand Hall Марказ", date: "27 июн", guests: 300, budget: 64500, stage: "contract", source: "Повторный клиент" },
  { id: 909, name: "Семья Холовых", phone: "+992 90 661-09-73", event: "Свадьба", hall: "Fly Garden", date: "06 июн", guests: 250, budget: 52000, stage: "won", source: "Instagram" },
  { id: 910, name: "Носиров Манучехр", phone: "+992 98 200-41-55", event: "Туй духтар", hall: "ЛЮКС зал", date: "30 июн", guests: 320, budget: 61000, stage: "lost", source: "Звонок", note: "Ушли к конкуренту — дешевле на 15%" },
];


export const CRM_CLIENTS = [
  { id: 1, name: "Азизов Фирдавс", phone: "+992 93 770-25-90", events: 3, total: 178000, last: "Туй · 27 июн 2026", tag: "VIP" },
  { id: 2, name: "Семья Рахимовых", phone: "+992 92 555-18-42", events: 2, total: 84000, last: "Свадьба · 20 июн 2026", tag: "Повторный" },
  { id: 3, name: "ООО «Сомон Тревел»", phone: "+992 44 620-11-00", events: 4, total: 96400, last: "Корпоратив · 14 июн 2026", tag: "VIP" },
  { id: 4, name: "Семья Назаровых", phone: "+992 90 415-88-27", events: 1, total: 9800, last: "Оши нахор · 13 июн 2026", tag: "Новый" },
  { id: 5, name: "Каримова Мехри", phone: "+992 91 333-72-14", events: 2, total: 31200, last: "Юбилей · 18 июн 2026", tag: "Повторный" },
  { id: 6, name: "Семья Холовых", phone: "+992 90 661-09-73", events: 1, total: 52000, last: "Свадьба · 06 июн 2026", tag: "Новый" },
];


export const BOOKINGS_SEED = [
  { date: "13 июн, суббота", items: [
    { hall: "ВИП зал", client: "Семья Назаровых", event: "Оши нахор", guests: 200, status: "confirmed" },
    { hall: "Фемали 1", client: "—", event: "Свободно для брони", guests: 0, status: "free" },
  ]},
  { date: "14 июн, воскресенье", items: [
    { hall: "Fly Garden", client: "ООО «Сомон Тревел»", event: "Корпоратив", guests: 90, status: "prepaid" },
    { hall: "ЛЮКС зал", client: "—", event: "Свободно для брони", guests: 0, status: "free" },
  ]},
  { date: "18 июн, четверг", items: [
    { hall: "Фемали 1", client: "Каримова М.", event: "Юбилей", guests: 120, status: "prepaid" },
  ]},
  { date: "20 июн, суббота", items: [
    { hall: "ЛЮКС зал", client: "Семья Рахимовых", event: "Свадьба", guests: 380, status: "prepaid" },
    { hall: "ВИП зал", client: "—", event: "Свободно для брони", guests: 0, status: "free" },
    { hall: "Grand Hall Марказ", client: "—", event: "Свободно для брони", guests: 0, status: "free" },
  ]},
  { date: "21 июн, воскресенье", items: [
    { hall: "ВИП зал", client: "Семья Гафуровых", event: "Оши нахор", guests: 200, status: "hold" },
  ]},
  { date: "27 июн, суббота", items: [
    { hall: "Grand Hall Марказ", client: "Азизов Фирдавс", event: "Туй", guests: 300, status: "confirmed" },
  ]},
];


// ---------------------------------------------------------------- СЧЕТА + ОТЧЁТЫ (Этап 2 ТЗ)
export const SUPPLIER_INVOICES = [
  { id: 2041, supplier: "Олими (мясо)", number: "СФ-318", date: "08 июн", due: "15 июн", kind: "РД1 — Продукты", point: "Душанбе Яккасарой", amount: 28400, status: "approved" },
  { id: 2042, supplier: "Баракат Фуд (овощи)", number: "СФ-322", date: "09 июн", due: "12 июн", kind: "РД1 — Продукты", point: "Fly Garden", amount: 6750, status: "new" },
  { id: 2043, supplier: "Coca-Cola дистрибьютор", number: "1188", date: "05 июн", due: "10 июн", kind: "РД1/4 — Напитки", point: "Сеть", amount: 12300, status: "overdue" },
  { id: 2044, supplier: "Барқи Точик", number: "Э-0645", date: "01 июн", due: "20 июн", kind: "РД8 — Коммунальные", point: "Сеть", amount: 18920, status: "new" },
  { id: 2045, supplier: "ТекстильПро (скатерти)", number: "СФ-77", date: "03 июн", due: "08 июн", kind: "РД8/3 — Оборудование", point: "Марказ", amount: 5400, status: "paid" },
  { id: 2046, supplier: "Сомон Климат (кондиционер)", number: "КП-19", date: "10 июн", due: "17 июн", kind: "РД8/3 — Оборудование", point: "Душанбе Яккасарой", amount: 4000, status: "new" },
];


export const CLIENT_INVOICES = [
  { id: 7101, client: "Семья Рахимовых", event: "Свадьба · ЛЮКС зал", date: "20 июн", amount: 58000, paid: 20000 },
  { id: 7102, client: "Азизов Фирдавс", event: "Туй · Grand Hall Марказ", date: "27 июн", amount: 64500, paid: 64500 },
  { id: 7103, client: "ООО «Сомон Тревел»", event: "Корпоратив · Fly Garden", date: "14 июн", amount: 22400, paid: 0 },
  { id: 7104, client: "Семья Назаровых", event: "Оши нахор · ВИП зал", date: "13 июн", amount: 9800, paid: 4900 },
  { id: 7105, client: "Каримова М.", event: "Юбилей · Фемали 1", date: "18 июн", amount: 15600, paid: 5000 },
];
