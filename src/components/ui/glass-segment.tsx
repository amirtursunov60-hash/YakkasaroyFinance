import React, { useEffect, useRef, useState } from "react";

// Переиспользуемый стеклянный сегмент-контрол: трек + скользящая пилюля под
// активной опцией (позиция/ширина — замер активной кнопки, как у вкладок и
// свитчера). Стекло — per-theme из .gseg/.gseg__pill (см. makeCss в theme/css.js).
// Цвета и блики берутся из палитры темы, отдельной адаптации не требуют.

export interface GlassSegmentOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
}

interface GlassSegmentProps<T extends string> {
  options: GlassSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  block?: boolean;        // на всю ширину контейнера (опции делят её поровну)
  ariaLabel?: string;
}

export function GlassSegment<T extends string>({
  options, value, onChange, size = "md", block = false, ariaLabel,
}: GlassSegmentProps<T>) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const measure = () => {
      const el = activeRef.current;
      if (!el) return;
      setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    };
    const r = requestAnimationFrame(measure);
    const t = setTimeout(measure, 240); // повтор после загрузки шрифтов/раскладки
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(r); clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [value, options.length, block, size]);

  return (
    <div className={`gseg gseg--${size}${block ? " gseg--block" : ""}`} role="radiogroup" aria-label={ariaLabel}>
      <div className="gseg__pill" style={{ left: pill.left, width: pill.width, opacity: pill.ready ? 1 : 0 }} />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={on ? activeRef : null}
            type="button"
            role="radio"
            aria-checked={on}
            className={`gseg__opt${on ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.icon}{o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
