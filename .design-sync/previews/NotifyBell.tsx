// Превью NotifyBell — колокольчик уведомлений в шапке. Лента личных уведомлений
// (комментарии и решения по заявкам) грузится из API при наличии профиля;
// бейдж — число непрочитанных, выпадашка раскрывается по клику. В песочнице без
// сессии показывается сама кнопка-колокольчик. `onGo` ведёт в раздел по клику.
import { NotifyBell } from "yakkasaroy-management";

const stage: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  padding: "4px 0",
};

export function Bell() {
  return (
    <div style={stage}>
      <NotifyBell onGo={() => {}} />
    </div>
  );
}
