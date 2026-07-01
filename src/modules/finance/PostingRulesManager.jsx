import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, CheckCircle2, BookOpenCheck, ChevronRight } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { fetchPostingRules, updatePostingRule, fetchChartAccounts } from "../../lib/api";
import { opLabel, UNUSED_RULE_COMBOS } from "../../utils/register";

// ------------------------------------------------------------- POSTING RULES
// Правила проводок (posting_rules, Реестр §13): как тип операции Реестра
// проецируется в Дт/Кт плана счетов. Правило задаётся для положительной
// суммы; отрицательная автоматически меняет Дт и Кт местами. Изменение
// правила мгновенно меняет журнал и ОСВ по плану счетов (проекция, не данные).
// Только фин-админ (RLS pr_write). Сворачиваемая секция во вкладке «Фонды».

const COMPONENT_LABELS = { cash: "деньги (счёт ДС)", fund: "фонд" };

export function PostingRulesManager() {
  const { C, st, isMobile } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [rs, accs] = await Promise.all([fetchPostingRules(), fetchChartAccounts()]);
      setRules(rs); setAccounts(accs);
    } catch (e) {
      setErr("Не удалось загрузить правила проводок: " + (e?.message || e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const setCode = async (rule, side, code) => {
    if (busy) return;
    const debitCode = side === "debit" ? code : rule.debit_code;
    const creditCode = side === "credit" ? code : rule.credit_code;
    if (debitCode === creditCode) { setErr("Дебет и кредит не могут быть одним счётом"); return; }
    setBusy(rule.id); setErr(""); setDone("");
    try {
      await updatePostingRule(rule.id, { debitCode, creditCode });
      setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, [side === "debit" ? "debit_code" : "credit_code"]: code } : r)));
      setDone("Правило обновлено — журнал и ОСВ пересчитаются при открытии");
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на изменение правил проводок." : msg);
    } finally { setBusy(null); }
  };

  const codeSelect = (rule, side, value) => (
    <select value={value} disabled={busy === rule.id}
      onChange={(e) => setCode(rule, side, e.target.value)}
      style={{ ...st.input, padding: "6px 8px", fontSize: 12, width: "100%", minWidth: 0 }}>
      {!accounts.some((a) => a.code === value) && <option value={value}>{value} (нет в плане счетов)</option>}
      {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
    </select>
  );

  return (
    <section style={{ ...st.fpCard, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <BookOpenCheck size={16} color={C.green} />
        <span style={{ fontSize: 14, fontWeight: 800 }}>Правила проводок</span>
        <ChevronRight size={15} color={C.sub} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </div>
      {open && (<>
        <div style={{ fontSize: 11.5, color: C.faint, margin: "8px 0 12px" }}>
          Как операции Реестра превращаются в проводки Дт/Кт. Правило — для положительной суммы
          (приход); отрицательная сама меняет Дт и Кт местами. Данные не трогаются — меняется только проекция.
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginBottom: 10 }}><AlertCircle size={15} /> {err}</div>}
        {done && <div style={{ ...st.reqSuccess, marginBottom: 10 }}><CheckCircle2 size={15} /> {done}</div>}
        {loading ? <div style={st.empty}><Loader2 size={16} className="spin" /> Загрузка…</div> : (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {rules.map((r) => (
              <div key={r.id} style={{ ...st.locCard, padding: "10px 14px", opacity: UNUSED_RULE_COMBOS.has(`${r.op_type}:${r.component}`) ? 0.65 : 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>
                  {opLabel(r.op_type)}
                  {UNUSED_RULE_COMBOS.has(`${r.op_type}:${r.component}`) &&
                    <span style={{ ...st.weekTag, marginLeft: 6, color: C.sub, background: `${C.sub}1a` }}>пока не встречается</span>}
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>компонента: {COMPONENT_LABELS[r.component] || r.component}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", marginBottom: 3 }}>Дебет</div>
                    {codeSelect(r, "debit", r.debit_code)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", marginBottom: 3 }}>Кредит</div>
                    {codeSelect(r, "credit", r.credit_code)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}
    </section>
  );
}
