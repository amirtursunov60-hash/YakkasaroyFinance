// «Зум-лупа»: пинч-зум разрешён (WCAG 1.4.4 — слабовидящие могут увеличить),
// но не «залипает» — как только пользователь отпускает пальцы, масштаб
// возвращается к 1 (страница снова вписана в экран).
//
// Программно сбросить пинч-зум на iOS/WebKit напрямую нельзя, поэтому
// используем штатный приём: на миг выставляем в viewport `maximum-scale=1`
// (браузер схлопывает текущий зум к 1), затем возвращаем исходный content,
// снова разрешающий зум для следующего жеста.

const ZOOMED = 1.05;       // порог: считаем «увеличено», если scale заметно > 1
const REVERT_MS = 350;     // сколько держать maximum-scale=1, чтобы кламп применился

export function enablePeekZoom(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const vp = document.querySelector('meta[name="viewport"]');
  const vv = window.visualViewport;
  if (!vp || !vv) return () => {};

  const base = vp.getAttribute("content")
    || "width=device-width, initial-scale=1.0, viewport-fit=cover";
  const clamp = "width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover";

  let timer: ReturnType<typeof setTimeout> | undefined;
  let resetting = false;

  const snapBack = () => {
    if (resetting) return;
    resetting = true;
    vp.setAttribute("content", clamp);          // схлопнуть зум к 1
    timer = setTimeout(() => {
      vp.setAttribute("content", base);          // снова разрешить зум жестами
      resetting = false;
    }, REVERT_MS);
  };

  const onGestureEnd = () => {
    if ((window.visualViewport?.scale ?? 1) > ZOOMED) snapBack();
  };

  // gestureend — iOS Safari/WebKit (окончание пинча). touchend — общий фолбэк.
  window.addEventListener("gestureend", onGestureEnd);
  window.addEventListener("touchend", onGestureEnd, { passive: true });

  return () => {
    window.removeEventListener("gestureend", onGestureEnd);
    window.removeEventListener("touchend", onGestureEnd);
    if (timer) clearTimeout(timer);
  };
}
