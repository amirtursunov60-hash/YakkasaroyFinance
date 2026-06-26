// Печатная форма счёта клиенту (gap-map Счета §8). Чистый билдер HTML —
// самодостаточный документ со своими (светлыми) стилями для печати/«Сохранить
// как PDF», не зависит от тёмной темы приложения. У счёта только итоговая
// сумма (позиций нет — по решению ТЗ детализация/НДС уходят в iiko), поэтому
// табличная часть — одна строка «Услуги банкета».
import { fmt } from "./format";

export interface InvoiceParty {
  name?: string | null;
  entity_type?: string | null;
  inn?: string | null;
  address?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_mfo?: string | null;
}

export interface InvoiceForPrint {
  number?: number | string | null;
  amount: number;
  currency?: { code?: string | null } | null;
  event_name?: string | null;
  hall?: string | null;
  event_on?: string | null;
  comment?: string | null;
  created_at?: string | null;
  counterparty?: InvoiceParty | null;
  location?: { name?: string | null; city?: string | null } | null;
}

export interface CompanyReq {
  name?: string | null;
  inn?: string | null;
  address?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_mfo?: string | null;
}

// Экранирование пользовательских строк, чтобы имя/комментарий не ломали HTML.
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ruDate = (iso?: string | null): string =>
  iso ? new Date(iso.length <= 10 ? iso + "T00:00:00" : iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }) : "—";

// Блок реквизитов стороны (продавец/покупатель) — только заполненные строки.
function partyLines(p: InvoiceParty | CompanyReq | null | undefined): string {
  if (!p) return "<div class='muted'>—</div>";
  const rows: string[] = [];
  if ((p as InvoiceParty).entity_type) rows.push((p as InvoiceParty).entity_type === "legal" ? "Юридическое лицо" : "Физическое лицо");
  if (p.inn) rows.push(`ИНН: ${esc(p.inn)}`);
  if (p.address) rows.push(esc(p.address));
  if (p.phone) rows.push(`тел.: ${esc(p.phone)}`);
  if ((p as InvoiceParty).contact_person) rows.push(`Контакт: ${esc((p as InvoiceParty).contact_person)}`);
  const bank: string[] = [];
  if (p.bank_name) bank.push(esc(p.bank_name));
  if (p.bank_account) bank.push(`р/с ${esc(p.bank_account)}`);
  if (p.bank_mfo) bank.push(`МФО ${esc(p.bank_mfo)}`);
  if (bank.length) rows.push(bank.join(" · "));
  return rows.map((r) => `<div>${r}</div>`).join("") || "<div class='muted'>реквизиты не указаны</div>";
}

// Полный HTML-документ счёта. paid — сумма уже оплаченного (для блока «Оплачено/Остаток»).
export function buildInvoiceHtml(invoice: InvoiceForPrint, company: CompanyReq, paid = 0): string {
  const cur = invoice.currency?.code || "TJS";
  const amount = Number(invoice.amount) || 0;
  const rest = amount - (Number(paid) || 0);
  const descParts = [invoice.event_name, invoice.hall].filter(Boolean).map((x) => esc(x));
  const desc = descParts.length ? `Услуги банкета: ${descParts.join(" · ")}` : "Услуги банкета";
  const place = [invoice.location?.name, invoice.location?.city].filter(Boolean).map((x) => esc(x)).join(", ");

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Счёт №${esc(invoice.number ?? "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; font-size: 14px; line-height: 1.45; }
  .sheet { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 20px; }
  .parties { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 20px; }
  .party { flex: 1; min-width: 240px; }
  .label { text-transform: uppercase; letter-spacing: .04em; font-size: 11px; color: #888; margin-bottom: 4px; font-weight: 700; }
  .pname { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  .muted { color: #999; }
  .meta { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 16px; font-size: 13px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #ddd; }
  th { background: #f4f4f4; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 12px; }
  .totals .grand { border-top: 2px solid #111; font-weight: 800; font-size: 16px; margin-top: 4px; }
  .rest { color: #b23; }
  .note { margin-top: 18px; color: #555; font-size: 13px; }
  .sign { margin-top: 48px; display: flex; gap: 40px; flex-wrap: wrap; }
  .sign .col { flex: 1; min-width: 220px; }
  .sign .line { border-top: 1px solid #999; margin-top: 36px; padding-top: 4px; color: #777; font-size: 12px; }
  .toolbar { max-width: 720px; margin: 0 auto 16px; }
  .toolbar button { font: inherit; padding: 8px 16px; border: 1px solid #1a7; background: #1a7; color: #fff; border-radius: 6px; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Печать / Сохранить как PDF</button></div>
  <div class="sheet">
    <h1>Счёт № ${esc(invoice.number ?? "")}</h1>
    <div class="sub">от ${ruDate(invoice.created_at)}${place ? ` · ${place}` : ""}</div>

    <div class="parties">
      <div class="party">
        <div class="label">Продавец</div>
        <div class="pname">${esc(company?.name || "—")}</div>
        ${partyLines(company)}
      </div>
      <div class="party">
        <div class="label">Покупатель</div>
        <div class="pname">${esc(invoice.counterparty?.name || "—")}</div>
        ${partyLines(invoice.counterparty)}
      </div>
    </div>

    <div class="meta">
      ${invoice.event_name ? `<span>Мероприятие: <b>${esc(invoice.event_name)}</b></span>` : ""}
      ${invoice.hall ? `<span>Зал: <b>${esc(invoice.hall)}</b></span>` : ""}
      ${invoice.event_on ? `<span>Дата мероприятия: <b>${ruDate(invoice.event_on)}</b></span>` : ""}
    </div>

    <table>
      <thead><tr><th>Наименование</th><th class="num">Сумма, ${esc(cur)}</th></tr></thead>
      <tbody><tr><td>${desc}</td><td class="num">${fmt(amount)}</td></tr></tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Итого:</span><b>${fmt(amount)} ${esc(cur)}</b></div>
      ${paid ? `<div class="row"><span>Оплачено:</span><span>${fmt(Number(paid))} ${esc(cur)}</span></div>` : ""}
      ${paid ? `<div class="row grand ${rest > 0.009 ? "rest" : ""}"><span>${rest > 0.009 ? "К оплате:" : "Оплачено полностью"}</span><span>${rest > 0.009 ? fmt(rest) + " " + esc(cur) : ""}</span></div>`
             : `<div class="row grand"><span>К оплате:</span><span>${fmt(amount)} ${esc(cur)}</span></div>`}
    </div>

    ${invoice.comment ? `<div class="note">Примечание: ${esc(invoice.comment)}</div>` : ""}

    <div class="sign">
      <div class="col"><div class="line">Продавец (подпись, печать)</div></div>
      <div class="col"><div class="line">Покупатель (подпись)</div></div>
    </div>
  </div>
</body></html>`;
}

// Открыть счёт в новом окне и вызвать печать (side effect; в SSR/без window — no-op).
export function openInvoicePrint(invoice: InvoiceForPrint, company: CompanyReq, paid = 0): boolean {
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank");
  if (!w) return false; // блокировщик попапов
  w.document.open();
  w.document.write(buildInvoiceHtml(invoice, company, paid));
  w.document.close();
  return true;
}
