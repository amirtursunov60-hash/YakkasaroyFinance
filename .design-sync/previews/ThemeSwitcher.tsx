// Превью ThemeSwitcher — «жидкое стекло» переключатель темы (light/dark/dim).
// ВАЖНО: все стили `.switcher*` заданы под родителем `.switcher-app` (как в
// AppShell), иначе контрол рендерится голым fieldset. Оборачиваем в него.
import { useState } from "react";
import { ThemeSwitcher } from "yakkasaroy-management";

type Theme = "light" | "dark" | "dim";

export function Default() {
  const [theme, setTheme] = useState<Theme>("dark");
  return (
    <div className="switcher-app" style={{ display: "inline-block" }}>
      <ThemeSwitcher value={theme} onValueChange={setTheme} />
    </div>
  );
}
