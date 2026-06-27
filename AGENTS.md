# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

> ВСЕГДА отвечать заказчику в чате на русском языке. Это касается всех сообщений ассистента, а не только надписей в UI.

## Общий контекст

Основной источник правил проекта уже описан в `CLAUDE.md`. Перед изменениями Codex должен прочитать и соблюдать `CLAUDE.md` как общие инструкции репозитория: описание продукта, архитектура, команды, правила Supabase, предметная область ХМС, UI-стиль, PR/deploy workflow и Definition of Done.

Если `AGENTS.md` и `CLAUDE.md` конфликтуют, для Codex приоритет имеет более строгое или более конкретное правило. Не ослаблять требования из `CLAUDE.md` без явной команды заказчика.

## Обязательная проверка перед работой

Перед любой AI-assisted работой в этом репозитории проверить `gstack`:

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

Если результат `GSTACK_MISSING`, остановиться и сказать заказчику:

```text
gstack is required for all AI-assisted work in this repo.
Install it:
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
Then restart your AI coding tool.
```

## Команды проекта

```bash
npm install
npm run dev        # Vite dev-сервер, http://localhost:5173
npm run build      # сборка в dist/
npm run preview    # просмотр сборки
npm test           # Vitest — прогон тестов один раз
npm run test:watch # Vitest в watch-режиме
npm run lint       # ESLint
npm run lint:fix   # ESLint с авто-исправлением
npm run typecheck  # tsc --noEmit
```

Перед завершением обычной кодовой задачи по возможности запускать:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Если проверку невозможно запустить, явно указать причину в финальном ответе.

## Рабочий процесс Codex

- Не пушить напрямую в `main`; изменения должны идти через отдельную ветку и Pull Request, если задача доходит до публикации.
- Не менять архитектуру, схему Supabase, migrations, RLS, Edge Functions или production-настройки без явной задачи.
- Не трогать `.env`, секреты, API-ключи, пароли, production credentials.
- Уважать текущую архитектуру: React 18 + Vite, Supabase через `src/lib/api.js`/типизированный клиент, навигация через `AppShell.jsx` и `src/data/navigation.js`.
- Новый чистый код писать на TypeScript; при касании старой логики следовать правилу из `CLAUDE.md`: touch -> extract -> type -> test.
- Изменения делать минимально и по задаче; не устраивать большой рефакторинг без отдельного согласования.
- После работы кратко описывать изменённые файлы, результат проверок и остаточные риски.

## UI и предметная область

- Язык интерфейса — русский.
- ХМС-термины не переводить и не переименовывать: ФП, ФРС, фонд, Директива, ЦКП, ИЦО, ЗРС, шляпа, статистика, квота, Реестр, состояния, боевое планирование, туйхона, точка.
- Для UI соблюдать текущий стиль проекта: тёмная тема в духе Alif Business, зелёные акценты, мобильная адаптация обязательна.
- Цвета брать из палитры/токенов темы `C` и связанных CSS-переменных; не добавлять захардкоженные цвета в компоненты.
- Для денег использовать утилиты из `src/utils/format.ts`: `fmt` и `fmtShort`.
- Модуль `src/modules/restaurant/` не развивать функционально без явного запроса; он остаётся дизайн-референсом.

## Supabase и данные

- Источник истины движения денег — `fp_register`; балансы фондов и счетов ДС не писать руками.
- Любое изменение схемы БД делать только новой миграцией в `supabase/migrations/`; применённые миграции не редактировать.
- Перед работой со схемой сверяться с последней миграцией и `supabase/README.md`.
- Новые таблицы должны учитывать RLS и существующие функции прав, описанные в `CLAUDE.md`.

