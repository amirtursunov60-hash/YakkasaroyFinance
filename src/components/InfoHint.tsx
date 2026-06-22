import React, { useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import { useTheme } from "../theme/theme";

// Контекстная подсказка по ХМС-термину: иконка «?», по наведению (десктоп) и
// тапу (телефон) показывает короткое пояснение. Доступно: кнопка с aria-label,
// всплывашка role="tooltip" связана через aria-describedby.
//
// Глоссарий — короткие пояснения (полный — в ТЗ, Приложение А). Термины не
// переводим и не переименовываем (правило проекта).
const GLOSSARY: Record<string, string> = {
  "ЗРС": "Формат заявки: данные → ситуация → предлагаемое решение. Подаётся от поста оргсхемы, а не «от пользователя».",
  "ЦКП": "Ценный конечный продукт — результат поста или отдела, ради которого он существует.",
  "ИЦО": "Информационный центр организации — место, где сводятся статистики по отделениям.",
  "ФП": "Финансовое планирование — еженедельная процедура (чт–ср) распределения поступивших средств по фондам.",
  "ФРС": "Каскадное распределение средств по фондам «матрёшкой» в три этапа: от выручки → маржинального → скорректированного дохода.",
  "Директива": "Документ, которым закрывается недельный период ФП; после неё операции в периоде запрещены.",
  "Реестр": "Единая лента всех операций ФП и источник истины: балансы фондов и счетов — производные от него.",
  "шляпа": "Описание поста: его ЦКП, обязанности и инструкции. Сотрудник «носит шляпу» поста.",
  "квота": "Плановое целевое значение статистики на период.",
};

export function InfoHint({ term, text }: { term?: string; text?: string }) {
  const { C } = useTheme();
  const [open, setOpen] = useState(false);
  const id = useId();
  const body = text || (term && GLOSSARY[term]) || "";
  if (!body) return null;

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        aria-label={term ? `Что такое «${term}»?` : "Подсказка"}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-grid", placeItems: "center", width: 18, height: 18, padding: 0,
          border: "none", background: "transparent", color: C.faint, cursor: "pointer", flexShrink: 0,
        }}
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            width: "min(260px, 72vw)", background: C.solid, color: C.text,
            border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px",
            fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, textAlign: "left",
            boxShadow: `0 8px 24px ${C.shadow}`, whiteSpace: "normal",
          }}
        >
          {body}
        </span>
      )}
    </span>
  );
}
