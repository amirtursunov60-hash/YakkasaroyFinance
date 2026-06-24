#!/bin/bash
# SessionStart hook: подготовка облачной сессии Claude Code.
#  1. Устанавливает gstack глобально (~/.claude/skills/gstack), если его нет,
#     и прогоняет setup — это требование репозитория (см. CLAUDE.md, check-gstack.sh).
#  2. Ставит npm-зависимости проекта, чтобы тесты/линтер/сборка были готовы.
# Идемпотентен, неинтерактивен. Запускается только в удалённой среде (веб).
set -uo pipefail

# Только облачная среда Claude Code на вебе; локально ничего не трогаем.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GSTACK_DIR="$HOME/.claude/skills/gstack"

# --- gstack ---------------------------------------------------------------
# Установку оборачиваем так, чтобы её сбой (например, запрет egress-политики)
# не ронял старт сессии: блокирующий PreToolUse-хук check-gstack.sh всё равно
# не даст работать без gstack, а сессия при этом успеет подняться.
if [ ! -d "$GSTACK_DIR/bin" ]; then
  echo "[session-start] gstack не найден — устанавливаю в $GSTACK_DIR" >&2
  if git clone --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_DIR" >&2; then
    if [ -x "$GSTACK_DIR/setup" ]; then
      ( cd "$GSTACK_DIR" && ./setup --team ) >&2 \
        || echo "[session-start] WARN: 'gstack setup --team' завершился с ошибкой" >&2
    fi
    echo "[session-start] gstack установлен" >&2
  else
    echo "[session-start] WARN: не удалось клонировать gstack (проверьте сетевую политику окружения — нужен доступ к github.com)" >&2
  fi
else
  echo "[session-start] gstack уже установлен — пропускаю" >&2
fi

# --- зависимости проекта --------------------------------------------------
# npm install (а не ci) — чтобы использовать кэш состояния контейнера.
if [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
  echo "[session-start] npm install" >&2
  ( cd "$CLAUDE_PROJECT_DIR" && npm install --no-audit --no-fund ) >&2 \
    || echo "[session-start] WARN: npm install завершился с ошибкой" >&2
fi

echo "[session-start] готово" >&2
exit 0
