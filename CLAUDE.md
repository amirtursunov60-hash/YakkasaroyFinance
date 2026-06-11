# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## О проекте

Yakkasaroy Management System — веб-приложение управления сетью ресторанов и туйхон «Яккасарой» (Душанбе · Худжанд · Панджакент) по технологии Hubbard Management System (ХМС): финансовое планирование по фондам, статистики с состояниями, 7-отделенческая оргсхема, CRM банкетов. Полное ТЗ — `docs/ТЗ_Yakkasaroy_Management_System.md`, обзор модулей и дорожная карта — `README.md`.

**Текущая стадия**: интерактивный прототип. Авторизация уже реальная (Supabase Auth, `src/lib/`), но все данные модулей — моки в памяти (`src/data/`). Следующий шаг по дорожной карте — схема БД в Supabase и замена `src/data/` на API-слой.

## Команды

```bash
npm install
npm run dev        # Vite dev-сервер, http://localhost:5173
npm run build      # сборка в dist/
npm run preview    # просмотр сборки
```

Тестов и линтера в проекте нет. Стек: React 18 + Vite 6 + lucide-react + @supabase/supabase-js. Без TypeScript, без Tailwind, без роутера, без библиотек графиков.

Для входа в приложение нужны переменные окружения `VITE_SUPABASE_URL` и `VITE_SUPABASE_KEY` (файл `.env` — в gitignore).

## Архитектура

Поток запуска: `src/main.jsx` → `src/App.jsx` (следит за сессией Supabase: профиль из таблицы `profiles` с ролью → `Login` либо `AppShell`; оборачивает всё в `ThemeCtx.Provider`).

**Роутинга нет** — навигация целиком на state в `src/components/AppShell.jsx`: пара `activeModule` (модуль из сайдбара) + `active` (раздел из верхней панели). Справочник модулей и разделов — `src/data/navigation.js` (`MODULES`, `MODULE_NAV`). Чтобы добавить экран: компонент в `src/modules/<модуль>/`, пункт в `navigation.js`, ветка рендера в `AppShell.jsx`.

```
src/
├── App.jsx                # корень: тема, сессия Supabase, логин ⇄ приложение
├── lib/                   # supabase.js (клиент), auth.js (signIn/signOut/getProfile)
├── theme/                 # ВСЁ оформление здесь, см. «Стиль» ниже
│   ├── theme.js           # THEMES (dark/light палитры C), ThemeCtx, useTheme
│   ├── styles.js          # makeStyles(C) → объект st со всеми inline-стилями
│   └── css.js             # makeCss(C) → строка глобального CSS (hover, анимации)
├── data/                  # МОКИ всех модулей; заменяются API-слоем при переходе на Supabase
├── components/            # AppShell (каркас+роутинг), Login, common (Stat, Stub), charts/ (свои SVG)
├── modules/
│   ├── finance/           # ядро: Directive, Income, Expenses, Funds, Control,
│   │                      # Suppliers, Clients, Payroll, Reports — отдельные файлы-экраны
│   ├── stats|org|dashboard|crm/  # один файл на модуль, разделы через проп view
│   └── restaurant/        # RestOrders, RestTables, RestMenu, RestStock
├── hooks/useIsMobile.js
└── utils/                 # format.js (fmt — деньги), funds.js (нормализация кодов фондов
                           # «ФД4» → «FD4»), stats.js (calcState — состояния ХМС, weekLabels)
```

Компоненты получают всё через `useTheme()`: `{ C, st, theme, setTheme, lang, setLang, isMobile, profile }`. Роли пользователя: `owner`, `fin_director`, `ops_director`, `location_manager`, `accountant`, `employee` (метки — в `AppShell.jsx`, права — в ТЗ §2).

## Предметная область (принципы из ТЗ — менять нельзя)

1. Распоряжаемся только фактически имеющимися средствами (сверка «факт vs расчёт» в Контроле средств).
2. Все деньги при поступлении распределяются по фондам по заданным схемам (3 этапа: от выручки → от маржинального дохода → от скорректированного дохода).
3. Расход — только из фонда через одобренную заявку или счёт.
4. ФП проводится еженедельными периодами, период закрывается Директивой.
5. Каждая точка учитывается отдельно, владелец видит консолидированную картину. Точка/филиал — первоклассная сущность, любая запись привязывается к точке.

## Правила для кода

- **Язык интерфейса — русский.** Все надписи, метки, комментарии в коде — на русском. Архитектурно заложен i18n (`lang`: ru/tj), но строки пока в коде.
- **ХМС-термины не переводить и не переименовывать** — ни в UI, ни в именах данных: ФП, ФРС, фонд, Директива, ЦКП, ИЦО, шляпа, статистика, состояния (Власть, Изобилие, Норма, Чрезвычайное положение, Опасность, Несуществование), боевое планирование, туйхона, точка. Глоссарий — Приложение А в ТЗ.
- **Моки лежат в `src/data/`** — новые демо-данные добавлять только туда, не зашивать в компоненты. Этот слой целиком заменится API при подключении Supabase, поэтому компоненты не должны мутировать данные напрямую сверх локального state.
- **Стиль — тёмная тема в духе Alif Business** (зелёные акценты, цвет по умолчанию dark). Все цвета берутся только из палитры `C` (`THEMES` в `src/theme/theme.js`) — обе темы (dark/light) должны работать; никаких захардкоженных цветов в компонентах.
- **Инлайн-стили из `src/theme/`**: общие стили добавлять в `makeStyles` (`styles.js`) и использовать как `st.имя`; hover/анимации — в `makeCss` (`css.js`) через классы. CSS-файлы (кроме `src/index.css`) и CSS-фреймворки не заводить.
- Графики — собственные SVG-компоненты в `src/components/charts/`, библиотеки графиков не подключать.
- Мобильная адаптация обязательна (управляющие работают с телефона): проверять ветки `isMobile` из `useIsMobile`.
- Денежные суммы форматировать через `fmt` из `src/utils/format.js`; основная валюта — TJS (сомони).
