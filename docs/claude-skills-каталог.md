# Каталог Claude-скиллов (памятка для Yakkasaroy)

> Справочник по доступным Claude-скиллам: что умеет, что нужно для работы и
> насколько полезно нам. Когда какой-то понадобится — ставим по инструкции внизу.
> Источник каталога: [`ComposioHQ/awesome-claude-skills`](https://github.com/ComposioHQ/awesome-claude-skills).

## Что такое Claude Skills

Переиспользуемые пакеты инструкций (папка с `SKILL.md`: YAML-фронтматтер «имя +
описание» + Markdown-инструкции, опционально скрипты/референсы/ассеты), которые учат
ИИ-агента классу задач. Грузятся **прогрессивно**: в начале сессии агент видит только
имя+описание (~100 токенов), тело подгружается, когда скилл релевантен. Работают в
Claude Code, Claude.ai, API, а также Codex, Cursor, Gemini CLI, Antigravity, Windsurf.

**Скилл ≠ MCP ≠ тулза.** MCP = доступ к внешней системе (авторизация, транспорт), тулза =
функция-действие, скилл = воркфлоу/поведение, когда доступ и тулзы уже на месте.

## Обозначения зависимостей

- ✅ **готов** — работает из коробки, ничего дополнительно не нужно.
- 🔑 **ключ** — нужен API-ключ стороннего сервиса.
- 🔌 **MCP/плагин** — нужен внешний MCP-сервер или плагин (чаще всего Composio/Rube).
- 🌐 **внешний сервис** — ходит в сторонний онлайн-сервис (учитывать доступ к данным).

---

## Уже установлено в этом репозитории (`.claude/skills/`)

| Скилл | Зависимости | Зачем нам |
|---|---|---|
| `xlsx` | ✅ | Финансовые таблицы/выгрузки с формулами |
| `pdf` | ✅ | Генерация/разбор PDF-отчётов, формы |
| `docx` | ✅ | Текстовые отчёты/документы |
| `pptx` | ✅ | Презентации (отчёты владельцу) |
| `changelog-generator` | ✅ | Релиз-ноты из git-коммитов под PR-воркфлоу |
| `webapp-testing` | ✅ | Playwright e2e — проверка адаптивных экранов |
| `skill-creator` | ✅ | Сборка собственных скиллов |
| `mcp-builder` | ✅ | Сборка собственных MCP-серверов (напр. iiko) |
| `supabase-migration` | ✅ | Миграции БД (собственный скилл проекта) |
| `yakkasaroy-finance` | ✅ | Инварианты денег/Реестра `fp_register` (собственный) |
| `yakkasaroy-dod` | ✅ | Критерии приёмки + мобильная адаптация (собственный) |
| `excalidraw-diagram` | ✅ | Редактируемые `.excalidraw`-диаграммы (флоучарты, архитектура, ER, sequence) для `docs/` |
| `audit` / `scan` / `diff` | 🔌🌐 | accesslint: доступность WCAG 2.2 (контраст, семантика, «цвет как единственный сигнал»). ⚠️ Для работы нужен MCP-сервер accesslint + отлаживаемый Chrome (`@accesslint/core` через CDP). Имена общие — возможны мис-срабатывания. |

---

## Кандидаты «на потом» (standalone, без внешних ключей)

Поставить можно в любой момент (см. «Как установить»). Помечены ⭐ — наиболее вероятно
пригодятся; остальные — по ситуации.

| Скилл | Зависимости | Что умеет / релевантность |
|---|---|---|
| `invoice-organizer` | ✅ | ⭐ Раскладывает счета/чеки, вытаскивает данные — finance-adjacent. Работает с локальными файлами. |
| `artifacts-builder` | ✅ | HTML-артефакты на React/Tailwind/shadcn для claude.ai. У нас нет Tailwind/shadcn — низкая релевантность. |
| `canvas-design` | ✅ | Визуальный арт в PNG/PDF (постеры). Низкая релевантность. |
| `theme-factory` | ✅ | Темизация артефактов/слайдов. ⚠️ Может конфликтовать с нашей темой `C`. |
| `content-research-writer` | ✅ | Помощь в написании контента с ресёрчем и цитатами. |
| `internal-comms` | ✅ | Внутренние коммуникации (апдейты, FAQ, статус-репорты). |
| `domain-name-brainstormer` | 🌐 | Идеи доменов + проверка доступности. Разовая задача. |
| `file-organizer` | ✅ | Раскладывает файлы, ищет дубли. ⚠️ Двигает файлы — лишний риск. |
| `meeting-insights-analyzer` | ✅ | Анализ транскриптов встреч. |
| `raffle-winner-picker` | ✅ | Случайный выбор победителей. Нерелевантно. |
| `tailored-resume-generator` | ✅ | Резюме под вакансию. Нерелевантно. |
| `twitter-algorithm-optimizer` | ✅ | Оптимизация твитов. Нерелевантно. |
| `video-downloader` | 🌐 | Скачивание видео с YouTube и др. |
| `developer-growth-analysis` | ✅ | Анализ истории чатов Claude Code на паттерны разработки. |
| `brand-guidelines` | ✅ | ⛔ Накатывает фирменные цвета **Anthropic** — конфликт с темой Alif. Не ставить. |

---

## Требуют внешних ключей / MCP (заводить осознанно)

Для финансового приложения это вопрос доступа стороннего посредника к данным — решать
отдельно.

| Скилл | Зависимости | Что умеет |
|---|---|---|
| `connect` | 🔌🔑 | Реальные действия в Gmail/Slack/GitHub/Notion и 1000+ сервисах (Composio). |
| `skill-share` | 🔌 | Создаёт скиллы и шарит их в Slack через Rube. |
| `image-enhancer` | 🌐 | Улучшение качества картинок/скриншотов. |
| `langsmith-fetch` | 🔑🌐 | Дебаг LangChain/LangGraph через трейсы LangSmith. У нас нет LangChain. |
| `competitive-ads-extractor` | 🌐 | Анализ рекламы конкурентов из ad-библиотек. |
| `lead-research-assistant` | 🌐 | Поиск и квалификация лидов. |
| `slack-gif-creator` | 🌐 | Анимированные GIF под Slack. |

---

## Полный каталог по категориям (по материалам источника)

Не всё из списка лежит в репозитории каталога под этими именами — часть авторская и
живёт в других репозиториях. Здесь — обзор «что вообще бывает», чтобы знать, что искать.

### Работа с документами
`docx`, `pdf`, `pptx`, `xlsx` (установлены), Markdown→EPUB Converter, Master Claude for Legal.

### Разработка и код
`artifacts-builder`, `aws-skills`, `building-blog`, `changelog-generator` (установлен),
Chrome Relay, Claude Code Terminal Title, Connect, D3.js Visualization, FFUF Web Fuzzing,
finishing-a-development-branch, Full-Page Screenshot, great_cto (7 сабагентов SDLC),
iOS Simulator, jules, LangSmith Fetch, lean-ctx, `mcp-builder` (установлен),
move-code-quality-skill, OpenWeb, overkill, Playwright Browser Automation,
prompt-engineering, pypict, reddit-fetch, Septim Agents Pack, `skill-creator` (установлен),
Skill Seekers, software-architecture, subagent-driven-development,
**test-driven-development**, using-git-worktrees, `webapp-testing` (установлен).

> Полезные, но **отсутствуют в репо-каталоге** под этими именами (искать у авторов):
> `test-driven-development`, `test-fixing`, `review-implementing`, `postgres` (read-only
> SQL), `using-git-worktrees`. Частично перекрываются встроенными скиллами Claude Code
> (`code-review`, `verify`, `run`).

### Данные и аналитика
CSV Data Summarizer, `deep-research` (есть встроенный), `postgres`, recursive-research,
root-cause-tracing.

### Бизнес и маркетинг
Brand Build Skills (59 скиллов), Brand Guidelines, Competitive Ads Extractor,
Domain Name Brainstormer, Internal Comms, Lead Research Assistant.

### Коммуникация и тексты
article-extractor, brainstorming, Content Research Writer, family-history-research,
Meeting Insights Analyzer, NotebookLM Integration, Twitter Algorithm Optimizer.

### Креатив и медиа
anydesign, Canvas Design, imagen, Image Enhancer, Slack GIF Creator, Theme Factory,
Video Downloader, youtube-transcript, swiftui-design-skill, Pixelbin-Media-Generation.

### Продуктивность и организация
File Organizer, Invoice Organizer, kaizen, n8n-skills, Raffle Winner Picker, solo-skills,
Tailored Resume Generator, ship-learn-next, tapestry.

### Командная работа и управление проектами
git-pushing, google-workspace-skills, mercury-mcp, outline, review-implementing,
test-fixing.

### Безопасность и системы
computer-forensics, file-deletion, metadata-extraction, threat-hunting-with-sigma-rules.

### Ассистивные технологии
ASD-AuDHD-PAI-Skills (pda-reframing).

### Автоматизация приложений через Composio (🔌🔑 нужен Rube MCP + ключ)
78 SaaS-приложений (500+ через Composio). Категории и примеры:
- **CRM/продажи:** Close, HubSpot, Pipedrive, Salesforce, Zoho.
- **Управление проектами:** Asana, Basecamp, ClickUp, Jira, Linear, Monday, Notion,
  Todoist, Trello, Wrike.
- **Коммуникация:** Discord, Intercom, Microsoft Teams, Slack, Telegram, WhatsApp.
- **Почта:** Gmail, Outlook, Postmark, SendGrid.
- **Код/DevOps:** Bitbucket, CircleCI, Datadog, GitHub, GitLab, PagerDuty, Render,
  Sentry, **Supabase**, **Vercel**.
- **Хранилища:** Box, Dropbox, Google Drive, OneDrive.
- **Таблицы/БД:** Airtable, Coda, Google Sheets.
- **Календари:** Cal.com, Calendly, Google Calendar, Outlook Calendar.
- **Соцсети:** Instagram, LinkedIn, Reddit, TikTok, Twitter/X, YouTube.
- **Email-маркетинг:** ActiveCampaign, Brevo, ConvertKit, Klaviyo, Mailchimp.
- **Поддержка:** Freshdesk, Freshservice, Help Scout, Zendesk.
- **E-commerce/платежи:** Shopify, Square, Stripe.
- **Дизайн/совместная работа:** Canva, Confluence, DocuSign, Figma, Miro, Webflow.
- **Аналитика:** Amplitude, Google Analytics, Mixpanel, PostHog, Segment.
- **HR:** BambooHR. **Автоматизация:** Make. **Встречи:** Zoom.

> Для нас Supabase/Vercel/GitHub уже закрыты прямыми, более доверенными интеграциями
> (официальный Supabase MCP, GitHub MCP, привязка Vercel к `main`) — Composio-обёртки
> избыточны, если не нужны массовые действия в Telegram/Slack и т.п.

---

## Как установить скилл

### Standalone-скилл из каталога
```bash
# 1) забрать каталог (если ещё нет)
git clone https://github.com/ComposioHQ/awesome-claude-skills.git

# 2) скопировать нужный скилл в репозиторий (доступен всей команде через PR)
cp -r awesome-claude-skills/<имя-скилла> .claude/skills/

# 3) (необязательно) проверить валидатором skill-creator
python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/<имя-скилла>

# 4) закоммитить отдельным PR в main (по процессу проекта)
```
Скилл подхватывается после перезапуска сессии и активируется сам, когда релевантен.

### Composio-автоматизации (🔌🔑)
```bash
claude --plugin-dir ./connect-apps-plugin   # поставить плагин
# затем: /connect-apps:setup → вставить API-ключ (бесплатный на dashboard.composio.dev)
# и авторизовать нужные приложения
```

### Собственный доменный скилл
Через установленный `skill-creator`:
```bash
python3 .claude/skills/skill-creator/scripts/init_skill.py <имя> --path .claude/skills
```
Образцы — наши `yakkasaroy-finance` и `yakkasaroy-dod`.

---

## Правила проекта при добавлении скиллов

- **Релевантность важнее «безвредности».** Метаданные каждого скилла висят в контексте
  постоянно → лишние скиллы = шум и риск мис-срабатывания (напр. `brand-guidelines`
  с цветами Anthropic против темы Alif). Ставить только то, что реально пригодится.
- Скиллы с 🔑/🔌/🌐 — заводить осознанно: для финансового приложения это доступ
  стороннего посредника к данным.
- Каждое добавление — **отдельным PR в `main`** (по процессу из `CLAUDE.md`).
