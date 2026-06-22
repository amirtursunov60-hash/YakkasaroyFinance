// Мобильный эквивалент Esc: системная кнопка/жест «Назад» закрывает верхний
// открытый модал, а не уводит со страницы. Роутера нет, поэтому синхронизируем
// модалы с history вручную:
//  - когда появляется модал (оверлей [data-modal]), добавляем запись в историю;
//  - «Назад» (popstate) при открытом модале — закрываем верхний (клик по
//    оверлею, у всех onClick=onClose), а не навигируем;
//  - если модал закрыли крестиком/фоном, убираем нашу запись из истории.
// Открытие/закрытие модалов ловим MutationObserver'ом — без правки 24 модалов.

export function enableModalBackClose(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let pushed = false;       // добавлена ли наша запись в историю под текущий модал
  let viaPop = false;       // закрытие инициировано кнопкой «Назад»

  const count = () => document.querySelectorAll('[data-modal="1"]').length;
  const closeTop = () => {
    const o = document.querySelectorAll<HTMLElement>('[data-modal="1"]');
    o[o.length - 1]?.click();
  };

  const sync = () => {
    const n = count();
    if (n > 0 && !pushed) {
      history.pushState({ __modal: true }, "");
      pushed = true;
    } else if (n === 0 && pushed && !viaPop) {
      // закрыли крестиком/фоном — снимаем нашу запись из истории
      pushed = false;
      history.back();
    } else if (n === 0) {
      pushed = false;
    }
  };

  const onPop = () => {
    if (count() > 0) {
      viaPop = true;
      pushed = false;       // запись уже «съедена» переходом назад
      closeTop();
      // если под ним остался ещё модал — observer заново добавит запись
      setTimeout(() => { viaPop = false; }, 0);
    }
  };

  const mo = new MutationObserver(() => sync());
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", onPop);

  return () => {
    mo.disconnect();
    window.removeEventListener("popstate", onPop);
  };
}
