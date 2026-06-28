// Превью ThemeSwitcher — стеклянный переключатель темы (light / dark / dim).
// Контролируемый компонент: оборачиваем в локальный state.
import { useState } from "react";
import { ThemeSwitcher } from "yakkasaroy-management";

type Theme = "light" | "dark" | "dim";

export function Default() {
  const [theme, setTheme] = useState<Theme>("dark");
  return <ThemeSwitcher value={theme} onValueChange={setTheme} />;
}
