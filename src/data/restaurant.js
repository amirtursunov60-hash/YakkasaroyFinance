
// ----- Данные ресторана -----
export const MENU_CATS = [
  { id: "hot", name: "Горячие блюда", items: [
    { id: 101, name: "Плов по-таджикски", price: 45, cost: 18, photo: "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=200" },
    { id: 102, name: "Шашлык из баранины", price: 60, cost: 28, photo: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=200" },
    { id: 103, name: "Манты (6 шт)", price: 35, cost: 14, photo: "https://images.unsplash.com/photo-1625938145744-533e82abf24e?w=200" },
    { id: 104, name: "Лагман", price: 38, cost: 15 },
  ]},
  { id: "salad", name: "Салаты и закуски", items: [
    { id: 201, name: "Салат Ачик-чучук", price: 18, cost: 5 },
    { id: 202, name: "Хумус с лепёшкой", price: 22, cost: 8 },
    { id: 203, name: "Сырная тарелка", price: 55, cost: 30 },
  ]},
  { id: "drink", name: "Напитки", items: [
    { id: 301, name: "Чай зелёный (чайник)", price: 12, cost: 2 },
    { id: 302, name: "Айран", price: 10, cost: 3 },
    { id: 303, name: "Компот домашний", price: 14, cost: 4 },
  ]},
  { id: "dessert", name: "Десерты", items: [
    { id: 401, name: "Чак-чак", price: 20, cost: 7 },
    { id: 402, name: "Торт «Яккасарой»", price: 35, cost: 15 },
  ]},
];

export const TABLES = [
  { id: 1, name: "Стол 1", seats: 4, zone: "ВИП зал", status: "free" },
  { id: 2, name: "Стол 2", seats: 6, zone: "ВИП зал", status: "busy", guests: 5, sum: 420, time: "1ч 20м" },
  { id: 3, name: "Стол 3", seats: 2, zone: "ВИП зал", status: "free" },
  { id: 4, name: "Стол 4", seats: 8, zone: "ЛЮКС зал", status: "busy", guests: 8, sum: 1240, time: "45м" },
  { id: 5, name: "Стол 5", seats: 4, zone: "ЛЮКС зал", status: "reserved", time: "19:00" },
  { id: 6, name: "Стол 6", seats: 10, zone: "ЛЮКС зал", status: "free" },
  { id: 7, name: "Терраса 1", seats: 4, zone: "Терраса", status: "busy", guests: 3, sum: 180, time: "20м" },
  { id: 8, name: "Терраса 2", seats: 4, zone: "Терраса", status: "free" },
];

export const STOCK = [
  { id: 1, name: "Баранина", unit: "кг", qty: 12, min: 15, cost: 65 },
  { id: 2, name: "Рис девзира", unit: "кг", qty: 48, min: 20, cost: 18 },
  { id: 3, name: "Морковь", unit: "кг", qty: 30, min: 10, cost: 4 },
  { id: 4, name: "Мука", unit: "кг", qty: 8, min: 25, cost: 5 },
  { id: 5, name: "Лук", unit: "кг", qty: 22, min: 10, cost: 3 },
  { id: 6, name: "Зелёный чай", unit: "кг", qty: 4, min: 3, cost: 80 },
  { id: 7, name: "Масло хлопковое", unit: "л", qty: 14, min: 10, cost: 22 },
];

export const ORDERS_SEED = [
  { id: 5012, table: "Стол 2", waiter: "Диловар", status: "cooking", items: [{ n: "Плов по-таджикски", q: 3 }, { n: "Чай зелёный (чайник)", q: 2 }], sum: 159, time: "12:40" },
  { id: 5013, table: "Стол 4", waiter: "Нигора", status: "ready", items: [{ n: "Шашлык из баранины", q: 8 }, { n: "Салат Ачик-чучук", q: 4 }], sum: 552, time: "12:52" },
  { id: 5014, table: "Терраса 1", waiter: "Диловар", status: "new", items: [{ n: "Лагман", q: 3 }, { n: "Айран", q: 3 }], sum: 144, time: "13:05" },
  { id: 5015, table: "Стол 4", waiter: "Нигора", status: "served", items: [{ n: "Манты (6 шт)", q: 2 }], sum: 70, time: "12:20" },
];
