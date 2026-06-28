# design-sync — заметки по репозиторию Yakkasaroy

Репозиторий — это **приложение** (Vite + React), а НЕ упакованная библиотека-дизайн-система.
Поэтому синк идёт в режиме **synth-entry** (компоненты собираются прямо из `src/`, без `dist/`).

## Ключевые гочи (учитывать при каждом ре-синке)

- **Нет собранного `dist/` библиотеки и нет Storybook** → `shape: "package"`, synth-entry.
  В `package.json` нет `main`/`module`/`exports`, поэтому конвертер синтезирует точку входа из `src/`.
- **Самосимлинк пакета обязателен.** Конвертер ищет пакет в `node_modules/<pkg>` (читает его
  `package.json` через `projectFor`). В репозитории приложения пакет сам себя не ставит, поэтому
  перед сборкой нужно создать симлинк:
  `ln -sfn "$PWD" node_modules/yakkasaroy-management`
  (симлинк в `node_modules` → gitignore, пересоздавать на каждом свежем клоне).
- **`--node-modules ./node_modules`** (корень репо — там резолвится react).
- **`--entry` НЕ передаём** — пусть синтезирует из `src/` (synth-entry).
- **Провайдер темы нужен для рендера.** Компоненты тянут контекст `useTheme()` из
  `src/theme/theme.js` (`ThemeCtx`), а токены — это JS-объект `THEMES`, который в рантайме
  выставляется CSS-переменными `--c-*` через `applyThemeVars` (в App.jsx). Без обёртки-провайдера,
  выставляющей `--c-*` и значение `ThemeCtx.Provider`, превью рендерятся без стилей.
  → используется `cfg.provider`, указывающий на модуль-обёртку (см. extraEntries).
- **Tailwind v4 и esbuild.** `src/index.css` подключает `@import "tailwindcss/..."`, но esbuild
  НЕ запускает компилятор Tailwind v4 → утилитарные классы (`bg-panel`, `text-money` …) в
  итоговый `styles.css` не попадают. Ядро на инлайн-стилях (`st.*` из `makeStyles`) от этого не
  страдает; компоненты, опирающиеся на Tailwind-классы, могут рендериться без части стилей —
  проверять в фазе верификации.
- **Большинство экранов модулей** (`finance/*`, `crm`, `org`, `staff`, `stats`, `dashboard`,
  `menu`) — прикладные экраны на Supabase (через `src/lib/api.js`), без пропсов; в изоляции данных
  нет → ожидаемо получают floor-card. Реальные переиспользуемые DS-примитивы:
  `src/components/ui/*`, `src/components/common.jsx`, `src/components/charts/*`,
  `src/components/InfoHint.tsx`, `src/components/TopWidgets.jsx`, `src/modules/manajet/MjPanel.jsx`.

## Критичные фиксы рендера превью (выяснено при калибровке — НЕ ломать)

- **`main.jsx` гард.** Синтез-вход делает `export * from src/main.jsx`, а тот в модульной
  области вызывает `createRoot(document.getElementById("root"))`. Без `#root` это падает и
  бандл НЕ присваивает `window.YakkasaroyDS` (все компоненты «not a component» в `[BUNDLE_EXPORT]`).
  Фикс — гард в `src/main.jsx`: монтируемся только если `#root` есть (в проде не меняется).
- **Импорты темы в провайдере — через подпуть пакета, НЕ `@/`.** `preview-provider.tsx` импортирует
  `yakkasaroy-management/src/theme/{theme,styles,css}`. Алиас `@/` esbuild резолвит в реальный путь
  репо, а компоненты идут через симлинк `node_modules/yakkasaroy-management/src/...` — это РАЗНЫЕ
  модули, отчего `theme.js`/`ThemeCtx` дублируется и `useTheme()` в компонентах возвращает дефолт
  (`st: null` → падение `Cannot read 'statLabel'`). Один путь = один модуль = контекст доходит.
- **Из `makeCss` убираем удалённые `@import`.** В `css.js` есть `@import url(fonts.googleapis…Inter)`.
  Провайдер инжектит `makeCss(C)` с вырезанным `@import url(...)` — иначе запрос к Google Fonts висит
  в песочнице, `networkidle` не наступает → таймауты захвата и ~12 с/превью. Превью на системном стеке.
- **Оверлеи/модалы — оборачивать в контейнер с `transform`.** `position:fixed` оверлей (`st.mdOverlay`)
  иначе кадрируется обрезанным (заголовок выходит за край). Обёртка `{transform:"translateZ(0)",
  position:"relative", height:N}` делает контейнер containing-block для fixed → модал центрируется
  ВНУТРИ карточки и виден целиком (см. `previews/ConfirmModal.tsx`). cardMode "single" в overrides.

## Авторские превью — конвенции (для фан-аута)

- Импорт компонентов: `import { X } from "yakkasaroy-management"` (шим на `window.YakkasaroyDS`).
- Провайдер темы оборачивает каждую ячейку автоматически (cfg.provider=DSPreviewProvider) — в превью
  его добавлять НЕ нужно, `useTheme()` уже работает.
- Контент — реалистичный, на русском, ХМС-термины не переводить (фонды ФД, Директива, ЗРС, смони…).
- Контролируемые компоненты (value/onChange) — оборачивать в локальный `useState`.
- Каждый named export = одна ячейка-история; 2–6 на компонент.

## Окружение

- Облачная сессия Claude Code на вебе: **DesignSync-авторизация недоступна** (`/design-login`
  требует интерактивный терминал). Заливка возможна только после «Send to Claude Code Web»
  из claude.ai/design ИЛИ при локальном запуске `/design-sync`.
- Node: `.nvmrc` = v22.22.2. Установка: `npm ci` (есть `package-lock.json`).
- Chromium для рендер-проверки предустановлен: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Команда сборки (synth-entry)

```bash
ln -sfn "$PWD" node_modules/yakkasaroy-management   # один раз на клон
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

## Re-sync risks (что может тихо устареть)

- Самосимлинк `node_modules/yakkasaroy-management` не в git — без него сборка падает с ENOENT.
- Провайдер-обёртка превью завязана на форму `ctxVal` из `App.jsx`
  (`{ C, st, theme, setTheme, lang, setLang, sound, setSound, isMobile, profile }`) — при изменении
  этой формы обновить модуль провайдера.
- Tailwind-классы в компонентах не стилизуются через esbuild (см. выше) — если ядро начнёт
  массово опираться на Tailwind вместо инлайн-`st`, понадобится прекомпиляция CSS Tailwind v4.
