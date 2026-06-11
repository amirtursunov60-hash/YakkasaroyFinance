
// ---------------------------------------------------------------- DIRECTIVE
// нормализация кода фонда: "ФД4 — Налог Яккасарой" -> "FD4", "ФД9/1" -> "FD9/1"
export function fundKeyFromSource(src) {
  const m = src.replace(/Ф\s*Д/i, "ФД").match(/Ф?Д?\s*([0-9]+(?:\/[0-9]+)?)/i);
  return m ? "FD" + m[1] : src;
}

export function fundKey(code) { return code.replace(/\s/g, ""); }
