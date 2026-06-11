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
