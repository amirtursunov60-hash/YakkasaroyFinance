import { supabase } from "../supabase";

// ---------------------------------------------------------------- Глобальный поиск
// Ищет по контрагентам, заявкам, счетам, банкетам, фондам, сотрудникам
export async function globalSearch(qstr) {
  const like = `%${qstr}%`;
  const [cp, req, bill, inv, fund, ppl] = await Promise.all([
    supabase.from("counterparties").select("id, name").ilike("name", like).eq("is_archived", false).limit(5),
    supabase.from("payment_requests").select("id, number, csw_solution, status").or(`csw_data.ilike.${like},csw_situation.ilike.${like},csw_solution.ilike.${like}`).limit(5),
    supabase.from("supplier_bills").select("id, number, kind, status, counterparty:counterparties(name)").ilike("number", like).limit(5),
    supabase.from("client_invoices").select("id, number, event_name, status").ilike("event_name", like).limit(5),
    supabase.from("funds").select("id, code, name").or(`name.ilike.${like},code.ilike.${like}`).eq("is_archived", false).limit(5),
    supabase.from("profiles").select("id, full_name, role").ilike("full_name", like).limit(5),
  ]);
  const res = [];
  (cp.data || []).forEach((x) => res.push({ type: "Контрагент", label: x.name, module: "finance", section: "suppliers" }));
  (req.data || []).forEach((x) => res.push({ type: "Заявка", label: `№${x.number} · ${x.csw_solution?.slice(0, 40) || ""}`, module: "finance", section: "requests" }));
  (bill.data || []).forEach((x) => res.push({ type: x.kind === "obligation" ? "Обязательство" : "Счёт поставщика", label: `№${x.number} · ${x.counterparty?.name || ""}`, module: "finance", section: "suppliers" }));
  (inv.data || []).forEach((x) => res.push({ type: "Банкет", label: `№${x.number} · ${x.event_name}`, module: "finance", section: "clients" }));
  (fund.data || []).forEach((x) => res.push({ type: "Фонд", label: `${x.code} · ${x.name}`, module: "finance", section: "funds" }));
  (ppl.data || []).forEach((x) => res.push({ type: "Сотрудник", label: x.full_name, module: "staff", section: "st_people" }));
  return res.slice(0, 14);
}
