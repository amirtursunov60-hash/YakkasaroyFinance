import { Wallet, ArrowUpRight, ArrowDownLeft, Layers, FileText, ClipboardList, SlidersHorizontal, Calculator, BarChart3, CalendarDays, List, LayoutGrid, LayoutDashboard, Users, UserPlus, Contact, Network, PiggyBank, FolderKanban, UtensilsCrossed, ConciergeBell, Armchair, Package, Clock, Flame, TrendingUp } from "lucide-react";



export const MODULES = [
  { key: "dashboard", icon: LayoutDashboard, label: "Личный кабинет" },
  { key: "staff", icon: Users, label: "Сотрудники" },
  { key: "stats", icon: BarChart3, label: "Статистики" },
  { key: "crm", icon: Contact, label: "CRM" },
  { key: "orgchart", icon: Network, label: "Организующая схема" },
  { key: "finance", icon: PiggyBank, label: "Финансовое планирование" },
  { key: "restaurant", icon: UtensilsCrossed, label: "Ресторан" },
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
  { key: "obligations", icon: FileText, label: "Обязательства" },
  { key: "payroll", icon: Calculator, label: "Расчёт зарплаты" },
  { key: "reports", icon: BarChart3, label: "Управленческие отчёты" },
  { key: "register", icon: List, label: "Реестр операций" },
];

export const NAV_RESTAURANT = [
  { key: "r_orders", icon: ConciergeBell, label: "Заказы" },
  { key: "r_tables", icon: Armchair, label: "Столы" },
  { key: "r_menu", icon: UtensilsCrossed, label: "Меню" },
  { key: "r_stock", icon: Package, label: "Склад" },
  { key: "r_shifts", icon: Clock, label: "Смены" },
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
  { key: "d_home", icon: LayoutDashboard, label: "Мой кабинет" },
  { key: "d_battle", icon: Flame, label: "Боевое планирование" },
  { key: "d_tasks", icon: ClipboardList, label: "Задачи" },
];

export const NAV_CRM = [
  { key: "c_funnel", icon: SlidersHorizontal, label: "Воронка банкетов" },
  { key: "c_clients", icon: Contact, label: "База клиентов" },
  { key: "c_bookings", icon: CalendarDays, label: "Брони залов" },
];

export const NAV_STAFF = [
  { key: "st_people", icon: Users, label: "Сотрудники" },
  { key: "st_invites", icon: UserPlus, label: "Приглашения" },
];

export const MODULE_NAV = { finance: NAV_FINANCE, restaurant: NAV_RESTAURANT, stats: NAV_STATS, orgchart: NAV_ORG, dashboard: NAV_DASH, crm: NAV_CRM, staff: NAV_STAFF };
