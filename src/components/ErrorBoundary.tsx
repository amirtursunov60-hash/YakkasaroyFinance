import React from "react";
import { reportError } from "../lib/monitoring";

// Граница ошибок: ловит исключения рендера в поддереве и показывает понятный
// экран вместо «белого экрана смерти». Текст ошибки виден — его можно прислать
// для диагностики. Кнопка перезагружает приложение.
// Класс-компонент: только так работает componentDidCatch / getDerivedStateFromError.

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Лог в консоль — для диагностики (видно в DevTools / удалённых логах).
    console.error("Перехвачена ошибка интерфейса:", error, info?.componentStack);
    reportError(error, { componentStack: info?.componentStack });
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
        background: "#1b1b1d", color: "#f5f8fa", fontFamily: "'Inter',system-ui,sans-serif",
      }}>
        <div style={{
          maxWidth: 460, width: "100%", textAlign: "center",
          background: "rgba(28,34,44,0.55)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 20, padding: "28px 22px",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Что-то пошло не так</div>
          <div style={{ fontSize: 13.5, color: "#a8b2bd", lineHeight: 1.6, marginBottom: 16 }}>
            Произошла ошибка на этом экране. Попробуйте перезагрузить. Если повторяется —
            пришлите текст ошибки ниже.
          </div>
          <pre style={{
            textAlign: "left", fontSize: 11.5, color: "#ff6b5e", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,107,94,0.35)", borderRadius: 10, padding: "10px 12px",
            margin: "0 0 16px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflowY: "auto",
          }}>
            {String(error?.message || error)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              background: "#3ddc84", color: "#04130a", border: "none", padding: "12px 24px",
              borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
