// Парсинг числа из пользовательского ввода: запятая как десятичный
// разделитель («12,5» → 12.5); пустая строка, null и не-число → 0.
export function parseNum(v: unknown): number {
  return parseFloat(String(v).replace(",", ".")) || 0;
}
