
export const fmt = (n: number): string =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Стабильный цвет аватара по имени (детерминированный хеш → палитра).
// Списки людей (оргсхема, задачи, сотрудники) различаются цветом инициалов.
const AVATAR_COLORS = ["#e8911c", "#5b8def", "#9c6ade", "#5bd6c9", "#d6c14a", "#3f9e6a", "#d64ad6", "#7bd88f"];
export const avatarColor = (name = ""): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
