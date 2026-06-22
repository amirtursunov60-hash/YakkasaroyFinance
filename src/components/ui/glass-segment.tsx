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
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
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

  // Клавиатура для паттерна radiogroup: ←/→ (и ↑/↓) переключают опцию,
  // Home/End — на крайние. Фокус едет вместе с выбором (roving tabindex).
  const move = (idx: number) => {
    const next = options[(idx + options.length) % options.length];
    if (!next || next.value === value) { btnRefs.current[idx]?.focus(); return; }
    onChange(next.value);
    btnRefs.current[(idx + options.length) % options.length]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": e.preventDefault(); move(i + 1); break;
      case "ArrowLeft": case "ArrowUp": e.preventDefault(); move(i - 1); break;
      case "Home": e.preventDefault(); move(0); break;
      case "End": e.preventDefault(); move(options.length - 1); break;
    }
  };

  return (
    <div className={`gseg gseg--${size}${block ? " gseg--block" : ""}`} role="radiogroup" aria-label={ariaLabel}>
      <div className="gseg__pill" style={{ left: pill.left, width: pill.width, opacity: pill.ready ? 1 : 0 }} />
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { btnRefs.current[i] = el; if (on) activeRef.current = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`gseg__opt${on ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.icon}{o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
