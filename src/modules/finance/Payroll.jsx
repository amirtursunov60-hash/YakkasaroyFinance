import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Save, Banknote, Loader2, AlertCircle, CheckCircle2, Plus, X, Trash2, Download, RotateCcw, FileSpreadsheet } from "lucide-react";
import { Stat } from "../../components/common";
import { STATE_COEF } from "../../data/payroll";
import { STAT_STATES } from "../../data/stats";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchPayrollSheet, createPayrollSheet, updatePayrollSheet,
  upsertPayrollLines, addPayrollLine, deletePayrollLine, payPayroll,
  fetchEmployees, fetchFunds, fetchIncomeRefs,
} from "../../lib/api";


// ---------------------------------------------------------------- PAYROLL
// Живые данные (ТЗ v2 §4.1.11): безокладная ЗП по баллам. Ведомость недели
// (payroll_sheets) со строками: баллы × коэффициент состояния ХМС;
// стоимость балла = ФОТ ÷ Σ эфф. баллов — ФОТ не превышается по построению.
// Аванс и удержания в строке. Черновик → Утверждена (финдиректор) →
// Выплачена (fp_pay_payroll: списание из ФД3 и счёта ДС через Реестр).

export function Payroll() {
  const { C, st, isMobile, profile } = useTheme();
  // Статусы ведомости ЗП — семантические токены темы.
  const SHEET_ST = {
    submitted: { label: "черновик",   color: C.warning },
    approved:  { label: "утверждена", color: C.successSoft },
    paid:      { label: "выплачена",  color: C.success },
  };
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canEdit = isFinAdmin || profile?.role === "accountant";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState([]);          // редактируемые строки
  const [fot, setFot] = useState("0");
  const [employees, setEmployees] = useState([]);
  const [funds, setFunds] = useState([]);
  const [refs, setRefs] = useState(null);
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(false);

  const loadStatic = useCallback(async () => {
    try {
      const [emps, fs, refData] = await Promise.all([fetchEmployees(), fetchFunds(), fetchIncomeRefs()]);
      setEmployees(emps.filter((e) => e.is_active));
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setRefs(refData);
    } catch (e) { setErr("Не удалось загрузить справочники: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const loadSheet = useCallback(async () => {
    if (!periodId) { setSheet(null); setRows([]); return; }
    try {
      const s = await fetchPayrollSheet(periodId);
      setSheet(s);
      setFot(String(s?.fot_amount ?? 0));
      setRows((s?.lines || []).map((l) => ({
        lineId: l.id, personId: l.person_id,
        name: l.person?.full_name || "—",
        points: String(Number(l.points) || 0), state: l.state,
        advance: String(Number(l.advance) || 0), deduction: String(Number(l.deduction) || 0),
      })).sort((a, b) => a.name.localeCompare(b.name, "ru")));
    } catch (e) { setErr("Не удалось загрузить ведомость: " + (e?.message || e)); }
  }, [periodId]);
  useEffect(() => { if (!periodsLoading) loadSheet(); }, [loadSheet, periodsLoading]);

  const editable = canEdit && sheet?.status === "submitted";

  // -------- расчёт (как в прототипе)
  const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
  const effOf = (r) => num(r.points) * (STATE_COEF[r.state] || 1);
  const totalEff = useMemo(() => rows.reduce((a, r) => a + effOf(r), 0), [rows]);
  const totalBase = useMemo(() => rows.reduce((a, r) => a + num(r.points), 0), [rows]);
  const pointCost = totalEff > 0 ? num(fot) / totalEff : 0;
  const accruedOf = (r) => effOf(r) * pointCost;
  const payoutOf = (r) => accruedOf(r) - num(r.advance) - num(r.deduction);
  const totals = useMemo(() => rows.reduce((t, r) => ({
    accrued: t.accrued + accruedOf(r), advance: t.advance + num(r.advance),
    deduction: t.deduction + num(r.deduction), payout: t.payout + payoutOf(r),
  }), { accrued: 0, advance: 0, deduction: 0, payout: 0 }), [rows, pointCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (personId, k, v) => {
    setRows((rs) => rs.map((r) => (r.personId === personId ? { ...r, [k]: v } : r)));
    setDone("");
  };

  // -------- действия
  const createSheet = async () => {
    if (busy) return;
    setBusy("create"); setErr(""); setDone("");
    try {
      const fd3 = funds.find((f) => f.code === "FD3");
      await createPayrollSheet({
        periodId, fundId: fd3?.id || null, createdBy: profile.id,
        personIds: employees.map((e) => e.id),
      });
      await loadSheet();
      setDone("Ведомость создана — проставьте ФОТ и баллы");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const saveSheet = async (alsoApprove = false) => {
    if (busy || !sheet) return;
    setBusy(alsoApprove ? "approve" : "save"); setErr(""); setDone("");
    try {
      await updatePayrollSheet(sheet.id, {
        fot_amount: num(fot),
        ...(alsoApprove ? { status: "approved" } : {}),
      });
      await upsertPayrollLines(rows.map((r) => ({
        sheet_id: sheet.id, person_id: r.personId,
        points: num(r.points), state: r.state,
        coefficient: STATE_COEF[r.state] || 1,
        accrued: Math.round(accruedOf(r) * 100) / 100,
        advance: num(r.advance), deduction: num(r.deduction),
      })));
      await loadSheet();
      setDone(alsoApprove
        ? "Ведомость утверждена — суммы зафиксированы, можно выплачивать"
        : "Ведомость сохранена");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const reopen = async () => {
    if (busy || !sheet) return;
    setBusy("reopen"); setErr(""); setDone("");
    try {
      await updatePayrollSheet(sheet.id, { status: "submitted" });
      await loadSheet();
      setDone("Ведомость возвращена в черновик");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doPay = async (accountId) => {
    if (busy || !sheet) return;
    setBusy("pay"); setErr(""); setDone("");
    try {
      await payPayroll(sheet.id, accountId, periodId);
      await loadSheet();
      setPaying(false);
      setDone("ЗП выплачена — списание из фонда проведено в Реестре");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const addPerson = async (personId) => {
    if (!personId || busy || !sheet) return;
    setBusy("add"); setErr("");
    try { await addPayrollLine(sheet.id, personId); await loadSheet(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const removeLine = async (r) => {
    if (busy) return;
    if (!window.confirm(`Убрать ${r.name} из ведомости?`)) return;
    setBusy("del"); setErr("");
    try { await deletePayrollLine(r.lineId); await loadSheet(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const exportCsv = () => {
    const head = ["Сотрудник", "Баллы", "Состояние", "Коэф", "Эфф. баллы", "Начислено", "Аванс", "Удержания", "К выплате"];
    const lines = rows.map((r) => [
      r.name, num(r.points), STAT_STATES[r.state]?.label || r.state, STATE_COEF[r.state] || 1,
      effOf(r).toFixed(1), accruedOf(r).toFixed(2), num(r.advance).toFixed(2),
      num(r.deduction).toFixed(2), payoutOf(r).toFixed(2),
    ]);
    lines.push(["ИТОГО", totalBase, "", "", totalEff.toFixed(1), totals.accrued.toFixed(2), totals.advance.toFixed(2), totals.deduction.toFixed(2), totals.payout.toFixed(2)]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `Ведомость_${sheet?.number || ""}_${period?.starts_on || ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const m = sheet ? SHEET_ST[sheet.status] : null;
  const notInSheet = employees.filter((e) => !rows.some((r) => r.personId === e.id));
  const GRID = isMobile
    ? "minmax(110px,1fr) 58px 96px 90px"
    : "minmax(180px,1fr) 76px 200px 90px 110px 90px 90px 110px 36px";

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Расчёт зарплаты · безокладная система по баллам</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
              {m && <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>
                ведомость №{sheet.number} · {m.label}
              </span>}
            </div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="ФОТ недели (из ФД3)" value={fmt(num(fot))} unit="TJS" accent />
          <Stat label="Сумма эфф. баллов" value={totalEff.toFixed(1)} unit={`из ${totalBase}`} />
          <Stat label="Стоимость балла" value={fmt(pointCost)} unit="TJS" />
          <Stat label="К выплате" value={fmt(totals.payout)} unit="TJS" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {!sheet && (
      <div style={{ ...st.locCard, ...st.empty, flexDirection: "column", gap: 12, padding: 30 }}>
        <FileSpreadsheet size={28} color={C.faint} />
        <div>Ведомости на эту неделю ещё нет</div>
        {canEdit && (
          <button style={{ ...st.btnGreen, opacity: busy === "create" ? 0.7 : 1 }} className="btn" onClick={createSheet} disabled={!!busy || !periodId}>
            {busy === "create" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Создать ведомость ({employees.length} сотрудников)
          </button>
        )}
      </div>
    )}

    {sheet && (<>
      {/* Управление */}
      <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ ...st.reqField, maxWidth: 220 }}>
            <span style={st.reqFieldLbl}>ФОТ недели, TJS (из ФД3)</span>
            <input type="number" inputMode="decimal" value={fot} disabled={!editable}
              onChange={(e) => { setFot(e.target.value); setDone(""); }}
              onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: "100%" }} className="amtIn" />
          </label>
          {editable && (
            <button style={{ ...st.btnGhost, opacity: busy === "save" ? 0.7 : 1 }} className="btn" onClick={() => saveSheet(false)} disabled={!!busy}>
              {busy === "save" ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Сохранить
            </button>
          )}
          {editable && isFinAdmin && (
            <button style={{ ...st.btnGreen, opacity: busy === "approve" ? 0.7 : 1 }} className="btn" onClick={() => saveSheet(true)} disabled={!!busy || num(fot) <= 0}>
              {busy === "approve" ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Утвердить ведомость
            </button>
          )}
          {sheet.status === "approved" && isFinAdmin && (
            <button style={st.btnGhost} className="btn" onClick={reopen} disabled={!!busy}>
              {busy === "reopen" ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />} В черновик
            </button>
          )}
          {sheet.status === "approved" && canEdit && (
            <button style={st.btnGreen} className="btn" onClick={() => setPaying(true)} disabled={!!busy}>
              <Banknote size={15} /> Выплатить {fmt(totals.payout)}
            </button>
          )}
          <button style={st.btnGhost} className="btn" onClick={exportCsv} disabled={!rows.length}>
            <Download size={15} /> {!isMobile && "Экспорт CSV"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 12, lineHeight: 1.6 }}>
          Стоимость балла = ФОТ ÷ сумма эффективных баллов, поэтому сумма начислений{" "}
          <b style={{ color: C.green }}>всегда равна ФОТ</b> — система не может потратить больше, чем выделено из ФД3.
          {sheet.status === "paid" && " Ведомость выплачена — списание проведено в Реестре."}
        </div>
      </section>

      {/* Таблица */}
      <div style={st.cardWrap}>
        <section style={st.card}>
          <div style={st.cardHead}>
            <div style={st.cardTitle}>Сотрудники и баллы</div>
            <div style={st.cardTotal}>1 балл = {fmt(pointCost)} <span style={st.unit}>TJS</span></div>
          </div>
          <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: GRID }}>
            <div style={st.fName}>Сотрудник</div>
            <div style={st.fPct}>Баллы</div>
            <div style={st.fPct}>{isMobile ? "Сост." : "Состояние статистики"}</div>
            {!isMobile && <div style={st.fNum}>Эфф. баллы</div>}
            {!isMobile && <div style={st.fNum}>Начислено</div>}
            {!isMobile && <div style={st.fNum}>Аванс</div>}
            {!isMobile && <div style={st.fNum}>Удерж.</div>}
            <div style={st.fNum}>К выплате</div>
            {!isMobile && <div />}
          </div>
          {rows.map((r) => {
            const sm = STAT_STATES[r.state] || {};
            const coef = STATE_COEF[r.state] || 1;
            return (
              <div key={r.personId} style={{ ...st.frow, gridTemplateColumns: GRID, alignItems: "center" }} className="frow">
                <div style={st.fName}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{r.name}</div>
                  {isMobile && (
                    <div style={{ fontSize: 10.5, color: C.faint }}>
                      аванс {fmt(num(r.advance))} · удерж. {fmt(num(r.deduction))}
                    </div>
                  )}
                </div>
                <div>
                  <input type="number" inputMode="decimal" value={r.points} disabled={!editable}
                    onChange={(e) => setRow(r.personId, "points", e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    style={{ ...st.pctInput, width: isMobile ? 50 : 62, padding: "6px 8px", fontSize: 13.5 }} className="amtIn" />
                </div>
                <div>
                  <select style={{ ...st.reqSelect, padding: "7px 9px", fontSize: isMobile ? 11 : 12, color: sm.color, fontWeight: 700, maxWidth: isMobile ? 96 : undefined }}
                    value={r.state} disabled={!editable}
                    onChange={(e) => setRow(r.personId, "state", e.target.value)}>
                    {Object.keys(STATE_COEF).map((k) => (
                      <option key={k} value={k}>{STAT_STATES[k].label} · ×{STATE_COEF[k]}</option>
                    ))}
                  </select>
                </div>
                {!isMobile && (
                  <div style={{ ...st.fNum, color: coef > 1 ? C.green : coef < 1 ? C.danger : C.sub, fontWeight: 600 }}>{effOf(r).toFixed(1)}</div>
                )}
                {!isMobile && <div style={{ ...st.fNum, fontWeight: 600 }}>{fmt(accruedOf(r))}</div>}
                {!isMobile && (
                  <div style={{ textAlign: "right" }}>
                    <input type="number" inputMode="decimal" value={r.advance} disabled={!editable}
                      onChange={(e) => setRow(r.personId, "advance", e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      style={{ ...st.pctInput, width: 72, padding: "6px 8px", fontSize: 12.5 }} className="amtIn" />
                  </div>
                )}
                {!isMobile && (
                  <div style={{ textAlign: "right" }}>
                    <input type="number" inputMode="decimal" value={r.deduction} disabled={!editable}
                      onChange={(e) => setRow(r.personId, "deduction", e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      style={{ ...st.pctInput, width: 72, padding: "6px 8px", fontSize: 12.5 }} className="amtIn" />
                  </div>
                )}
                <div style={{ ...st.fNum, fontWeight: 800, fontSize: isMobile ? 13 : 15 }}>{fmt(payoutOf(r))}</div>
                {!isMobile && (
                  <div style={{ textAlign: "right" }}>
                    {editable && (
                      <button style={{ ...st.iconBtn, color: C.danger }} className="btn" disabled={!!busy}
                        onClick={() => removeLine(r)} title="Убрать из ведомости">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: GRID }}>
            <div style={st.fName}><b>Итого</b></div>
            <div style={{ ...st.fPct, fontWeight: 700 }}>{totalBase}</div>
            <div />
            {!isMobile && <div style={{ ...st.fNum, fontWeight: 700 }}>{totalEff.toFixed(1)}</div>}
            {!isMobile && <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.accrued)}</div>}
            {!isMobile && <div style={{ ...st.fNum, fontWeight: 700, color: C.warning }}>{fmt(totals.advance)}</div>}
            {!isMobile && <div style={{ ...st.fNum, fontWeight: 700, color: C.danger }}>{fmt(totals.deduction)}</div>}
            <div style={{ ...st.fNum, fontWeight: 800, color: C.green, fontSize: 16 }}>{fmt(totals.payout)}</div>
            {!isMobile && <div />}
          </div>
          {editable && notInSheet.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <select style={{ ...st.mdSelect, width: "auto", fontSize: 12.5 }} className="fin" value="" disabled={!!busy}
                onChange={(e) => addPerson(e.target.value)}>
                <option value="">+ добавить сотрудника в ведомость</option>
                {notInSheet.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          )}
        </section>
      </div>

      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Как это работает:</b> у каждого сотрудника — базовые баллы (вес должности).
        Состояние статистики умножает их: Власть ×1.3, Опасность ×0.7. Сотрудник с растущей статистикой
        зарабатывает больше автоматически — формула одна для всех. Состояния пока выставляются вручную;
        после запуска модуля «Статистики» будут подтягиваться сами (ТЗ §4.1.11).
      </div>
    </>)}

    {paying && refs && sheet && (
      <PayModal C={C} st={st} total={totals.payout} accounts={refs.accounts}
        busy={busy === "pay"} onClose={() => setPaying(false)} onConfirm={doPay} />
    )}
  </>);
}

// ---------------------------------------------------------------- Выплата
function PayModal({ C, st, total, accounts, busy, onClose, onConfirm }) {
  useScrollLock();
  const [accountId, setAccountId] = useState("");
  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Выплата зарплаты</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>Сумма к выплате</span>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {fmt(total)} <span style={st.locUnit}>TJS</span>
          </div>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Счёт ДС — откуда платим</span>
          <select style={st.mdSelect} className="fin" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— выберите —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy || !accountId} onClick={() => onConfirm(accountId)}>
            {busy ? <Loader2 size={15} className="spin" /> : <Banknote size={15} />} Выплатить
          </button>
        </div>
      </div>
    </div>
  );
}
