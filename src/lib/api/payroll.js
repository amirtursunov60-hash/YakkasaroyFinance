import { supabase } from "../supabase";

// ---------------------------------------------------------------- Расчёт зарплаты
// Ведомость выбранной недели (одна на период в MVP) со строками
export async function fetchPayrollSheet(periodId) {
  if (!periodId) return null;
  const { data, error } = await supabase
    .from("payroll_sheets")
    .select(`id, number, status, fot_amount, fund_id, comment, created_at,
      lines:payroll_lines(id, person_id, points, state, coefficient, accrued, advance, deduction,
        person:profiles(id, full_name, role))`)
    .eq("period_id", periodId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPayrollSheet({ periodId, fundId, createdBy, personIds }) {
  const sheet = await supabase
    .from("payroll_sheets")
    .insert({ period_id: periodId, fund_id: fundId || null, created_by: createdBy })
    .select().single();
  if (sheet.error) throw sheet.error;
  if (personIds.length) {
    const { error } = await supabase
      .from("payroll_lines")
      .insert(personIds.map((person_id) => ({ sheet_id: sheet.data.id, person_id })));
    if (error) throw error;
  }
  return sheet.data;
}

export async function updatePayrollSheet(id, patch) {
  const { error } = await supabase.from("payroll_sheets").update(patch).eq("id", id);
  if (error) throw error;
}

// Сохранение строк ведомости (фиксирует коэффициенты и начисления)
export async function upsertPayrollLines(rows) {
  const { error } = await supabase
    .from("payroll_lines")
    .upsert(rows, { onConflict: "sheet_id,person_id" });
  if (error) throw error;
}

export async function addPayrollLine(sheetId, personId) {
  const { error } = await supabase
    .from("payroll_lines").insert({ sheet_id: sheetId, person_id: personId });
  if (error) throw error;
}

export async function deletePayrollLine(id) {
  const { error } = await supabase.from("payroll_lines").delete().eq("id", id);
  if (error) throw error;
}

// Выплата утверждённой ведомости (серверная функция fp_pay_payroll)
export async function payPayroll(sheetId, cashAccountId, periodId) {
  const { error } = await supabase.rpc("fp_pay_payroll", {
    p_sheet_id: sheetId, p_cash_account_id: cashAccountId, p_period_id: periodId,
  });
  if (error) throw error;
}
