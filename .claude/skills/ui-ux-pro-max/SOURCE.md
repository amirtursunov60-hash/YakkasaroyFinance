# Источник скилла

- **Скилл:** UI/UX Pro Max (`ui-ux-pro-max`), версия 2.5.0
- **Репозиторий:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **Сайт:** https://uupm.cc
- **Лицензия:** MIT
- **Автор:** NextLevelBuilder

## Что установлено

- `SKILL.md` — инструкция скилла (из `.claude/skills/ui-ux-pro-max/SKILL.md` репозитория-источника).
- `scripts/` — Python-скрипты поиска и генерации дизайн-системы (`search.py`, `core.py`, `design_system.py`; из `src/ui-ux-pro-max/scripts/`).
- `data/` — справочники CSV (стили, палитры, шрифты, UX-гайдлайны, чарты, стеки; из `src/ui-ux-pro-max/data/`).

## Адаптация при установке

Пути запуска скриптов в `SKILL.md` приведены к раскладке Claude Code:
`skills/ui-ux-pro-max/…` → `.claude/skills/ui-ux-pro-max/…`. Скрипты требуют Python 3
(`python3 .claude/skills/ui-ux-pro-max/scripts/search.py …`).

Обновление: `npx uipro-cli init --ai claude` (официальный установщик) либо повторное
копирование из репозитория-источника.
