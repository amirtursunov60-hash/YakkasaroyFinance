// Превью GlobalSearch — глобальный поиск в шапке (контрагенты, заявки, счета,
// банкеты, фонды, сотрудники). Поиск дебаунсится и ходит в API только при вводе
// от 2 символов, поэтому в покое показывается само поле ввода. Колбэк `onGo`
// открывает соответствующий раздел по клику на результат.
import { GlobalSearch } from "yakkasaroy-management";

const stage: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  maxWidth: 360,
  padding: "4px 0",
};

export function InHeader() {
  return (
    <div style={stage}>
      <GlobalSearch onGo={() => {}} />
    </div>
  );
}
