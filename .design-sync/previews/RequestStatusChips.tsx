// Превью RequestStatusChips — чипы-фильтры заявок по статусам (раздел «Заявки»
// и Директива). Каждый чип показывает счётчик; активный подсвечивается цветом
// статуса. `C` и счётчики берём из темы / задаём реалистично.
import { useState } from "react";
import { RequestStatusChips, useTheme } from "yakkasaroy-management";

// Типичная картина недели: часть на рассмотрении, часть одобрена/оплачена.
const counts = {
  review: 5,
  approved: 8,
  rejected: 2,
  revision: 3,
  paid: 12,
  withdrawn: 1,
  all: 31,
};

export function Filters() {
  const { C } = useTheme();
  const [filter, setFilter] = useState("approved");
  return <RequestStatusChips C={C} counts={counts} filter={filter} setFilter={setFilter} />;
}

export function ReviewQueue() {
  const { C } = useTheme();
  const [filter, setFilter] = useState("review");
  return (
    <RequestStatusChips
      C={C}
      counts={{ review: 7, approved: 4, rejected: 0, revision: 2, paid: 9, withdrawn: 0, all: 22 }}
      filter={filter}
      setFilter={setFilter}
    />
  );
}
