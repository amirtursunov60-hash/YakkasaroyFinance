import React from "react";
import { X } from "lucide-react";
import { useTheme } from "../theme/theme";
import { useScrollLock } from "../hooks/useScrollLock";

// Единый каркас модального окна: оверлей + карточка + заголовок + крестик,
// scroll-lock и data-modal="1" (на него завязаны глобальные Esc и кнопка
// «назад» на телефоне — обработчики подключает App.jsx). Содержимое и футер —
// children. Новые модалы делать через этот компонент; старые ~30 ручных
// копий каркаса переводить по мере касания (Boy Scout).

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  // Ширина карточки в px: на экране будет min(width, 100%) — мобильная адаптация
  width?: number;
  // Закрывать ли по клику на оверлей (выключать для форм с несохранёнными данными)
  closeOnOverlay?: boolean;
  children: React.ReactNode;
}

export function Modal({ title, onClose, width = 560, closeOnOverlay = true, children }: ModalProps) {
  // st в рантайме всегда задан провайдером (App.jsx); дефолт контекста в theme.js — null,
  // поэтому уточняем тип локально, чтобы tsc не считал st возможным null.
  const { st } = useTheme() as unknown as { st: Record<string, React.CSSProperties> };
  useScrollLock();
  return (
    // Синтетический клик (isTrusted=false) шлют глобальные Esc/«назад»-обработчики
    // (escClose/modalBackClose кликают по [data-modal]) — он закрывает модал всегда,
    // closeOnOverlay гасит только случайный реальный тап по подложке.
    <div style={st.mdOverlay} data-modal="1" onClick={(e) => { if (closeOnOverlay || !e.isTrusted) onClose(); }}>
      <div style={{ ...st.mdCard, width: `min(${width}px, 100%)` }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{title}</div>
          <button style={st.iconBtn} className="btn" onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
