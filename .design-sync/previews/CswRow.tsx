// Превью CswRow — строка тела ЗРС-заявки: подпись-капс и текст. Используется в
// карточке заявки для полей «Данные → Ситуация → Решение». `C` берём из темы.
import { CswRow, useTheme } from "yakkasaroy-management";

const wrap: React.CSSProperties = {
  display: "grid",
  gap: 12,
  maxWidth: 560,
};

// Полный блок ЗРС: цель, ситуация, данные, решение — как в карточке заявки.
export function CswBlock() {
  const { C } = useTheme();
  return (
    <div style={wrap}>
      <CswRow C={C} label="Цель расхода" text="Замена изношенного теплового оборудования на горячем цехе" />
      <CswRow
        C={C}
        label="Ситуация"
        text="Две из четырёх плит вышли из строя, нагрузка на банкетную неделю выросла, кухня не успевает к выдаче."
      />
      <CswRow
        C={C}
        label="Данные"
        text="Счёт поставщика «Технопарк» на 18 500 смони, срок поставки 3 дня, гарантия 12 мес."
      />
      <CswRow
        C={C}
        label="Решение"
        text="Закупить две индукционные плиты из фонда ФД4 «Развитие», ввести в строй до пятницы."
      />
    </div>
  );
}

// Пустое значение отображается как прочерк.
export function EmptyValue() {
  const { C } = useTheme();
  return (
    <div style={wrap}>
      <CswRow C={C} label="Решение" text="" />
    </div>
  );
}
