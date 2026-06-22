// Esc закрывает верхний открытый модал. Все оверлеи модалов помечены
// data-modal="1" и закрываются кликом по фону (onClick=onClose), поэтому по
// Escape достаточно «кликнуть» самый верхний оверлей — сработает его onClose
// (с учётом гардов вроде !busy в ConfirmModal). Один глобальный слушатель —
// не нужно дублировать обработчик в каждом из ~24 модалов.

export function enableEscClose(): () => void {
  if (typeof document === "undefined") return () => {};
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const overlays = document.querySelectorAll<HTMLElement>('[data-modal="1"]');
    const top = overlays[overlays.length - 1]; // верхний по порядку в DOM
    if (top) { e.preventDefault(); top.click(); }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
