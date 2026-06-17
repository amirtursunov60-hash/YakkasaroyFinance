import { useTheme } from "../../theme/theme";

// Публичное меню кофейни «Яккасарой Family» — отдельное приложение (свой деплой).
// В разделе Ресторан → «Меню» показываем его целиком на всю область контента.
// Отступы вокруг (4px на телефоне) задаёт padding контейнера main в AppShell.
const MENU_URL = "https://yakkasaroy-menu.vercel.app/";

export function MenuModule() {
  const { isMobile } = useTheme();
  return (
    <iframe title="Меню кофейни «Яккасарой Family»" src={MENU_URL}
      style={{
        width: "100%",
        // высота под область контента: вычитаем шапку+ленту разделов и отступы;
        // на телефоне ещё safe-area сверху
        height: isMobile ? "calc(100dvh - 118px - env(safe-area-inset-top))" : "calc(100dvh - 120px)",
        border: "none", borderRadius: 8, background: "#fff", display: "block",
      }} />
  );
}
