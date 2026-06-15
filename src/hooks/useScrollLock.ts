import { useEffect } from "react";

// Блокирует прокрутку страницы под открытым модалом: свайп вверх/вниз двигает
// сам модал (его внутренний скролл), а фон остаётся на месте. Снимается при
// размонтировании. Вызывать в компоненте-модале.
export function useScrollLock(): void {
  useEffect(() => {
    const { overflow, paddingRight } = document.body.style;
    // компенсируем ширину полосы прокрутки на десктопе, чтобы фон не «дёргался»
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, []);
}
