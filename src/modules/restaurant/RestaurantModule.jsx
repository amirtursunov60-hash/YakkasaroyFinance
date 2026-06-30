import { useEffect, useRef } from "react";
import { useTheme } from "../../theme/theme";

// Вкладка «Ресторан» = ВЕСЬ наш новый Ресторан-модуль (репо pos-and-menu),
// задеплоенный в тот же Vercel-проект и открытый по маршруту #/restaurant.
// Показываем его целиком в iframe и синхронизируем тему/язык Финанса
// (постим в iframe по postMessage; модуль слушает source: "yk-finance").
const RESTAURANT_URL = "https://yakkasaroy-menu.vercel.app/#/restaurant";

export function RestaurantModule() {
  const { isMobile, theme, lang } = useTheme();
  const ref = useRef(null);

  // отправить текущую тему/язык в iframe
  const pushTheme = () => {
    try { ref.current?.contentWindow?.postMessage({ source: "yk-finance", theme, lang }, "*"); } catch { /* iframe ещё не готов */ }
  };

  // тема/язык поменялись в Финансе → прокинуть в модуль
  useEffect(() => { pushTheme(); }, [theme, lang]);

  // модуль сообщил, что готов принять тему → шлём сразу
  useEffect(() => {
    const onMsg = (e) => { if (e.data && e.data.source === "yk-restaurant" && e.data.ready) pushTheme(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [theme, lang]);

  return (
    <iframe
      ref={ref}
      title="Ресторан-модуль Яккасарой"
      src={RESTAURANT_URL}
      onLoad={pushTheme}
      style={{
        width: "100%",
        // ленты разделов в модуле «Ресторан» нет — остаётся только шапка (60px) и паддинги,
        // поэтому iframe выше, чем у обычных экранов (без пустой полосы снизу)
        height: isMobile ? "calc(100dvh - 64px - env(safe-area-inset-top))" : "calc(100dvh - 96px)",
        border: "none", borderRadius: 8, display: "block",
      }}
    />
  );
}
