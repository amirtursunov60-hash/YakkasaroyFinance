
// Точная сумма до дирамов (две цифры после запятой) — для Реестра, Директивы,
// форм ввода, любых мест, где важна точность до копейки.
export const fmt = (n: number): string =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Сокращённая сумма для дашбордов и обзорных карточек, где важен порядок
// величины, а не точность: 1 342 000 → «1,34 млн», 81 000 → «81 тыс».
// В точных местах (Реестр/Директива) использовать fmt, а не это.
export function fmtShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const num = (x: number, d: number) =>
    x.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: d });
  if (abs >= 1_000_000_000) return `${sign}${num(abs / 1_000_000_000, 2)} млрд`;
  if (abs >= 1_000_000) return `${sign}${num(abs / 1_000_000, 2)} млн`;
  if (abs >= 1_000) return `${sign}${num(abs / 1_000, 1)} тыс`;
  return `${sign}${num(abs, 0)}`;
}

// Стабильный цвет аватара по имени (детерминированный хеш → палитра).
// Списки людей (оргсхема, задачи, сотрудники) различаются цветом инициалов.
const AVATAR_COLORS = ["#e8911c", "#5b8def", "#9c6ade", "#5bd6c9", "#d6c14a", "#3f9e6a", "#d64ad6", "#7bd88f"];
export const avatarColor = (name = ""): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
