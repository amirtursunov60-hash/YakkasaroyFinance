// Превью InfoHint — контекстная подсказка по ХМС-термину (иконка «?», тултип
// по наведению/тапу). Сама по себе иконка почти пустая, поэтому показываем её
// в контексте — рядом со строками/заголовками, где термин реально встречается.
// Термины берём из встроенного глоссария компонента (ЗРС, ЦКП, ИЦО, Директива…).
import { InfoHint } from "yakkasaroy-management";

const wrap: React.CSSProperties = {
  display: "grid",
  gap: 14,
  maxWidth: 520,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 14,
  fontWeight: 600,
};

// Подсказки в строках формы/раздела рядом с ключевыми терминами.
export function GlossaryRows() {
  return (
    <div style={wrap}>
      <div style={rowStyle}>
        Заявка на расход средств (ЗРС) <InfoHint term="ЗРС" />
      </div>
      <div style={rowStyle}>
        ЦКП поста «Шеф-повар» <InfoHint term="ЦКП" />
      </div>
      <div style={rowStyle}>
        Сводка статистик в ИЦО <InfoHint term="ИЦО" />
      </div>
      <div style={rowStyle}>
        Закрытие недели Директивой <InfoHint term="Директива" />
      </div>
    </div>
  );
}

// Подсказка как заголовок раздела + произвольный текст пояснения.
export function HeadingHint() {
  return (
    <div style={wrap}>
      <h3 style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0, fontSize: 17 }}>
        Распределение по фондам (ФРС) <InfoHint term="ФРС" />
      </h3>
      <div style={rowStyle}>
        Реестр операций ФП <InfoHint term="Реестр" />
      </div>
      <div style={rowStyle}>
        Источник средств — фонд{" "}
        <InfoHint text="Фонд ФД4 «Развитие» пополняется на этапе скорректированного дохода; расход — только по одобренной ЗРС." />
      </div>
    </div>
  );
}
