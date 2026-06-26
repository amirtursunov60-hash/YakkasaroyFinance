import { describe, it, expect } from "vitest";
import { buildInvoiceHtml, esc } from "./invoicePrint";
import { fmt } from "./format";

const baseInvoice = {
  number: 42,
  amount: 50000,
  currency: { code: "TJS" },
  event_name: "Свадьба",
  hall: "Большой зал",
  event_on: "2026-07-15",
  created_at: "2026-06-26T10:00:00Z",
  counterparty: { name: "Иванов И.И.", entity_type: "individual", inn: "123456789", phone: "+992 900 00 00 00" },
  location: { name: "Душанбе", city: "Душанбе" },
};
const company = { name: "Яккасарой", inn: "555", bank_name: "Алиф Банк", bank_account: "20402...", bank_mfo: "350101" };

describe("esc", () => {
  it("экранирует html-спецсимволы", () => {
    expect(esc(`<script>"x"&'y'`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  });
  it("пустые значения → пустая строка", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("buildInvoiceHtml", () => {
  it("включает номер, сумму и стороны", () => {
    const html = buildInvoiceHtml(baseInvoice, company, 0);
    expect(html).toContain("Счёт № 42");
    expect(html).toContain(fmt(50000));
    expect(html).toContain("Яккасарой");
    expect(html).toContain("Иванов И.И.");
    expect(html).toContain("Свадьба");
    expect(html).toContain("Большой зал");
  });

  it("без оплаты — «К оплате» равно сумме", () => {
    const html = buildInvoiceHtml(baseInvoice, company, 0);
    expect(html).toContain("К оплате:");
    expect(html).not.toContain("Оплачено:");
  });

  it("частичная оплата — показывает оплачено и остаток", () => {
    const html = buildInvoiceHtml(baseInvoice, company, 20000);
    expect(html).toContain("Оплачено:");
    expect(html).toContain(fmt(20000));
    expect(html).toContain(fmt(30000));       // остаток
  });

  it("полная оплата — «Оплачено полностью»", () => {
    const html = buildInvoiceHtml(baseInvoice, company, 50000);
    expect(html).toContain("Оплачено полностью");
  });

  it("экранирует имя покупателя (защита от инъекции)", () => {
    const html = buildInvoiceHtml(
      { ...baseInvoice, counterparty: { name: "<img src=x onerror=alert(1)>" } }, company, 0);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("экранирует комментарий и банковские реквизиты", () => {
    const html = buildInvoiceHtml(
      { ...baseInvoice, comment: "<b>hack</b>", counterparty: { name: "X", bank_name: "<i>bank</i>" } }, company, 0);
    expect(html).not.toContain("<b>hack</b>");
    expect(html).toContain("&lt;b&gt;hack&lt;/b&gt;");
    expect(html).not.toContain("<i>bank</i>");
  });

  it("показывает физ/юрлицо покупателя", () => {
    const legal = buildInvoiceHtml({ ...baseInvoice, counterparty: { name: "ООО Ромашка", entity_type: "legal" } }, company, 0);
    expect(legal).toContain("Юридическое лицо");
  });
});
