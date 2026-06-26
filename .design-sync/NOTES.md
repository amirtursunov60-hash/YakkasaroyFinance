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
