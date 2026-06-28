#!/bin/bash
# PostToolUse (Edit|Write): мгновенный контроль качества после правки кода —
# по мотивам хуков победителя хакатона Anthropic (everything-claude-code),
# адаптировано под наш стек (ESLint flat-config + tsc, npm; без Prettier).
#
# Делает по затронутому файлу .ts/.tsx/.js/.jsx:
#   1. eslint --fix      — авто-починка стиля (best-effort);
#   2. поиск console.log — предупреждение (по DoD их быть не должно);
#   3. tsc --noEmit      — проверка типов (только для .ts/.tsx).
# Никогда не блокирует и не роняет сессию: всё best-effort, выход всегда 0.
# Замечания возвращаются Claude через hookSpecificOutput.additionalContext.
set -uo pipefail

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"

input=$(cat)
file=$(printf '%s' "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);process.stdout.write((i.tool_input&&i.tool_input.file_path)||'')}catch(e){}})" 2>/dev/null)

# Интересуют только файлы кода, которые существуют на диске.
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) : ;;
  *) echo '{}'; exit 0 ;;
esac
[ -f "$file" ] || { echo '{}'; exit 0; }

notes=""

# 1. ESLint --fix по одному файлу (тихо, не падаем при ошибке конфигурации).
( cd "$PROJ" && npx --no-install eslint --fix "$file" ) >/dev/null 2>&1 || true

# 2. Поиск console.log (после возможной авто-починки).
if grep -nE 'console\.log' "$file" >/dev/null 2>&1; then
  hits=$(grep -nE 'console\.log' "$file" 2>/dev/null | head -5)
  notes="${notes}В файле остались console.log (по DoD убрать перед коммитом):\n${hits}\n"
fi

# 3. Проверка типов для .ts/.tsx — фильтруем вывод по этому файлу.
case "$file" in
  *.ts|*.tsx)
    tscout=$( ( cd "$PROJ" && npx --no-install tsc --noEmit --pretty false ) 2>&1 | grep -F "$(basename "$file")" | head -10 || true )
    if [ -n "$tscout" ]; then
      notes="${notes}Ошибки типов (tsc) по этому файлу:\n${tscout}\n"
    fi
    ;;
esac

if [ -z "$notes" ]; then
  echo '{}'
  exit 0
fi

# Возвращаем замечания Claude как дополнительный контекст (не блокируя).
printf '%b' "$notes" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const out={hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:'[Контроль качества] '+d}};process.stdout.write(JSON.stringify(out))})" 2>/dev/null || echo '{}'
exit 0
