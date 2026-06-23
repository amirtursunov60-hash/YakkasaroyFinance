import { useEffect } from "react";
import { feedbackSuccess, feedbackError } from "../lib/feedback";

// Звуковая/тактильная отдача на результат операции: тон «успех» при появлении
// сообщения done, тон «ошибка» + вибрация при появлении err. Звук по умолчанию
// выключен — управляется переключателем «Звук» (см. lib/feedback). Подключается
// одной строкой в модулях с состояниями done/err.
export function useActionFeedback(done?: unknown, err?: unknown): void {
  useEffect(() => { if (done) feedbackSuccess(); }, [done]);
  useEffect(() => { if (err) feedbackError(); }, [err]);
}
