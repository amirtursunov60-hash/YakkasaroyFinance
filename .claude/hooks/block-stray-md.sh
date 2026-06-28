#!/bin/bash
# PreToolUse (Write): блокирует создание «случайных» .md/.txt файлов,
# чтобы документация оставалась консолидированной (README, CLAUDE.md, docs/, supabase/).
# Идея заимствована у победителя хакатона Anthropic (everything-claude-code),
# адаптирована под наш проект: разрешены легитимные зоны документации.
#
# Вход: JSON на stdin (tool_input.file_path). Выход: JSON-решение на stdout.
#   {}                                 — разрешить
#   {"permissionDecision":"deny",...}  — запретить (детали — в stderr)
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);process.stdout.write((i.tool_input&&i.tool_input.file_path)||'')}catch(e){}})" 2>/dev/null)

# Нет пути или это не .md/.txt — пропускаем без проверки.
case "$file" in
  *.md|*.txt) : ;;
  *) echo '{}'; exit 0 ;;
esac

base=$(basename "$file")

# Разрешённые имена файлов (общепринятые служебные доки).
case "$base" in
  README.md|CLAUDE.md|CONTRIBUTING.md|AGENTS.md|CHANGELOG.md|LICENSE.txt)
    echo '{}'; exit 0 ;;
esac

# Разрешённые зоны документации проекта.
case "$file" in
  */docs/*|*/supabase/*|*/.claude/*|*/.agents/*)
    echo '{}'; exit 0 ;;
esac

# Иначе — блокируем создание разрозненного файла документации.
cat >&2 <<MSG
BLOCKED: создание разрозненного файла документации.
  Файл: $file

В этом проекте документация консолидирована. Используйте:
  • README.md / CLAUDE.md — обзор и инструкции;
  • docs/…              — ТЗ и доменные конспекты;
  • supabase/README.md  — описание схемы и миграций.

Если новый .md действительно нужен — положите его в docs/ или supabase/.
MSG
echo '{"permissionDecision":"deny","message":"Создание разрозненного .md/.txt запрещено. Используйте README/CLAUDE/docs/supabase (см. stderr)."}'
exit 0
