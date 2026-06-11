
// ---------------------------------------------------------------- РАСЧЁТ ЗАРПЛАТЫ ПО БАЛЛАМ (Этап 3 ТЗ)
// Безокладная система: стоимость балла = ФОТ недели ÷ сумма эффективных баллов.
// Эффективные баллы = баллы поста × коэффициент состояния статистики.
export const STATE_COEF = { power: 1.3, affluence: 1.15, normal: 1.0, emergency: 0.85, danger: 0.7, nonexistence: 0.9 };

export const PAYROLL_SEED = [
  { id: 1, name: "Саидов Фаррух", post: "Шеф-повар", dept: "4", points: 90, state: "affluence" },
  { id: 2, name: "Боймурадова Мадина", post: "Рук. отд. персонала", dept: "1", points: 70, state: "normal" },
  { id: 3, name: "Назарова Шахло", post: "Администратор ВИП/Люкс", dept: "4", points: 65, state: "power" },
  { id: 4, name: "Каримова Нилуфар", post: "Менеджер по банкетам", dept: "2", points: 65, state: "emergency" },
  { id: 5, name: "Чалолов Точиддин", post: "Юрист", dept: "7", points: 60, state: "normal" },
  { id: 6, name: "Сафарова Мехрангез", post: "Бухгалтер (Душанбе)", dept: "3", points: 60, state: "normal" },
  { id: 7, name: "Рахмонов Умед", post: "Су-шеф", dept: "4", points: 60, state: "normal" },
  { id: 8, name: "Нурматов Абдукаюм", post: "Начальник адм. отдела", dept: "7", points: 55, state: "normal" },
  { id: 9, name: "Юсупова Манижа", post: "Бухгалтер (Худжанд)", dept: "3", points: 55, state: "emergency" },
  { id: 10, name: "Рахимова Дилноза", post: "SMM-менеджер", dept: "2", points: 50, state: "affluence" },
  { id: 11, name: "Холов Далер", post: "Старший кассир", dept: "3", points: 45, state: "normal" },
  { id: 12, name: "Шарипов Джамшед", post: "Наставник официантов", dept: "5", points: 45, state: "normal" },
  { id: 13, name: "Назаров Бахтиёр", post: "Техник", dept: "4", points: 40, state: "danger" },
  { id: 14, name: "Гулова Зарина", post: "Офис-менеджер", dept: "1", points: 35, state: "normal" },
  { id: 15, name: "Азимова Фарзона", post: "Хостес", dept: "6", points: 30, state: "power" },
];
