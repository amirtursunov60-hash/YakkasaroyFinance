import { useTheme } from "../../theme/theme";

// Публичное меню кофейни «Яккасарой Family» — отдельное приложение (свой деплой).
// В разделе Ресторан → «Меню» показываем его целиком на всю область контента.
const MENU_URL = "https://yakkasaroy-menu.vercel.app/";

export function MenuModule() {
  const { isMobile } = useTheme();
  return (
    <iframe title="Меню кофейни «Яккасарой Family»" src={MENU_URL}
      style={{
        width: "100%",
        height: isMobile ? "calc(100dvh - 150px)" : "calc(100dvh - 110px)",
        border: "none", borderRadius: 12, background: "#fff", display: "block",
      }} />
  );
}
