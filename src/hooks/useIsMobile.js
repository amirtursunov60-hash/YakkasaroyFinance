import { useState, useEffect } from "react";


export function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 880 : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < 880);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return m;
}

// «Широкий» экран — настоящий десктоп (≥1024px). Телефон в альбомной (~844–926px)
// сюда НЕ попадает: там шапка тесная, и второстепенные элементы (поиск) прячем.
export function useIsWide() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  useEffect(() => {
    const on = () => setW(window.innerWidth >= 1024);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
