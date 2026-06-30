import { Wallet, ArrowUpRight, ArrowDownLeft, Layers, FileText, ClipboardList, SlidersHorizontal, Calculator, BarChart3, CalendarDays, List, LayoutGrid, LayoutDashboard, Users, UserPlus, Contact, Network, PiggyBank, FolderKanban, ConciergeBell, Flame, TrendingUp, ShieldCheck, Building2, Mail, Archive } from "lucide-react";



export const MODULES = [
  { key: "dashboard", icon: LayoutDashboard, label: "Личный кабинет" },
  { key: "staff", icon: Users, label: "Сотрудники" },
  { key: "stats", icon: BarChart3, label: "Статистики" },
  { key: "crm", icon: Contact, label: "CRM" },
  { key: "orgchart", icon: Network, label: "Организующая схема" },
  { key: "finance", icon: PiggyBank, label: "Финансовое планирование" },
  // «Ресторан» — наш новый модуль (репо pos-and-menu, тот же Vercel), показывается
  // целиком в iframe (#/restaurant). Меню — это вкладка ВНУТРИ ресторан-модуля,
  // поэтому отдельного пункта «Меню» в сайдбаре нет. Прежние мок-экраны restaurant
  // (RestOrders/Tables/Stock) остаются в src/modules/restaurant как дизайн-референс.
  { key: "restaurant", icon: ConciergeBell, label: "Ресторан" },
  { key: "projects", icon: FolderKanban, label: "Управление проектами" },
];


// Разделы (сайдбар) для каждого модуля
export const NAV_FINANCE = [
  { key: "control", icon: Wallet, label: "Контроль средств" },
  { key: "income", icon: ArrowUpRight, label: "Доходы" },
  { key: "expense", icon: ArrowDownLeft, label: "Расходы" },
  { key: "suppliers", icon: FileText, label: "Счета поставщиков" },
  { key: "clients", icon: ClipboardList, label: "Счета клиентов" },
  { key: "funds", icon: Layers, label: "Фонды" },
  { key: "directive", icon: SlidersHorizontal, label: "Директива" },
  { key: "requests", icon: ClipboardList, label: "Заявки" },
  { key: "payroll", icon: Calculator, label: "Расчёт зарплаты" },
  { key: "reports", icon: BarChart3, label: "Управленческие отчёты" },
  { key: "register", icon: List, label: "Реестр операций" },
  { key: "audit", icon: ShieldCheck, label: "Журнал аудита" },
  { key: "archive", icon: Archive, label: "Архив" },
];

// Ресторан — единый модуль (своя внутренняя навигация внутри iframe,
// включая вкладку «Меню»), поэтому в Финансе у него один раздел на всю область.
export const NAV_RESTAURANT = [
  { key: "r_app", icon: ConciergeBell, label: "Ресторан" },
];

export const NAV_STATS = [
  { key: "s_ico", icon: LayoutGrid, label: "ИЦО · доска статистик" },
  { key: "s_all", icon: List, label: "Все статистики" },
  { key: "s_ref", icon: TrendingUp, label: "Состояния · справочник" },
];

export const NAV_ORG = [
  { key: "o_chart", icon: Network, label: "Оргсхема · 7 отделений" },
  { key: "o_hats", icon: FileText, label: "Шляпы · должностные папки" },
];

export const NAV_DASH = [
  { key: "d_owner", icon: BarChart3, label: "Сводка собственника" },
  { key: "d_home", icon: LayoutDashboard, label: "Мой кабинет" },
  { key: "d_battle", icon: Flame, label: "Боевое планирование" },
  { key: "d_tasks", icon: ClipboardList, label: "Задачи" },
];

export const NAV_CRM = [
  { key: "c_funnel", icon: SlidersHorizontal, label: "Воронка банкетов" },
  { key: "c_clients", icon: Contact, label: "База клиентов" },
  { key: "c_counterparties", icon: Building2, label: "Контрагенты" },
  { key: "c_bookings", icon: CalendarDays, label: "Брони залов" },
  { key: "c_massmail", icon: Mail, label: "Рассылки клиентам" },
];

export const NAV_STAFF = [
  { key: "st_people", icon: Users, label: "Сотрудники" },
  { key: "st_invites", icon: UserPlus, label: "Приглашения" },
];

export const MODULE_NAV = { finance: NAV_FINANCE, restaurant: NAV_RESTAURANT, stats: NAV_STATS, orgchart: NAV_ORG, dashboard: NAV_DASH, crm: NAV_CRM, staff: NAV_STAFF };
