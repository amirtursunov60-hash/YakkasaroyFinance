// Превью FolderIcon — маленькая SVG-иконка папки, цвет через проп color.
import { FolderIcon } from "yakkasaroy-management";

const item = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13.5,
  fontWeight: 600,
};
const row = {
  display: "flex",
  gap: 22,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

// Папки видов дохода / отделений в разных цветах.
export function Palette() {
  return (
    <div style={row}>
      <span style={item}><FolderIcon color="#e8911c" /> Доход от зала</span>
      <span style={item}><FolderIcon color="#3ddc84" /> Туйхона</span>
      <span style={item}><FolderIcon color="#4a9eff" /> Доставка</span>
      <span style={item}><FolderIcon color="#ff6b5e" /> Прочее</span>
    </div>
  );
}

export function FundCodes() {
  return (
    <div style={row}>
      <span style={item}><FolderIcon color="#3ddc84" /> ФД1 · Резерв</span>
      <span style={item}><FolderIcon color="#e8911c" /> ФД4 · Снабжение</span>
      <span style={item}><FolderIcon color="#9b6bff" /> ФД7 · Развитие</span>
    </div>
  );
}
