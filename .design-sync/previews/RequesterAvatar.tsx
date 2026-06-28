// Превью RequesterAvatar — аватар автора заявки (инициалы + цвет по имени, или фото).
import { RequesterAvatar } from "yakkasaroy-management";

const row = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

// Инициалы с цветом, выведенным из имени поста/сотрудника.
export function Initials() {
  return (
    <div style={row}>
      <RequesterAvatar requester={{ full_name: "Фируз Назаров" }} />
      <RequesterAvatar requester={{ full_name: "Малика Саидова" }} />
      <RequesterAvatar requester={{ full_name: "Джамшед Каримов" }} />
      <RequesterAvatar requester={{ full_name: "Нигина Рахимова" }} />
    </div>
  );
}

// Круглые и разного размера (как в ленте комментариев ЗРС).
export function RoundAndSizes() {
  return (
    <div style={row}>
      <RequesterAvatar requester={{ full_name: "Шавкат Усмонов" }} size={28} round />
      <RequesterAvatar requester={{ full_name: "Зарина Холова" }} size={34} round />
      <RequesterAvatar requester={{ full_name: "Бахтиёр Нуров" }} size={48} round />
    </div>
  );
}
