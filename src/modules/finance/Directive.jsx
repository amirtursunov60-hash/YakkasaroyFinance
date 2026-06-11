import { useState, useMemo } from "react";
import { ClipboardList, Calculator, ChevronRight, ChevronDown, CalendarDays, Check, RotateCcw, CheckCircle2, XCircle, RotateCw, Ban, Lock, ArrowRightLeft } from "lucide-react";
import { Stat } from "../../components/common";
import { FUND_LEVELS, FUND_SOURCES, INCOME_TREE, REQUEST_GROUPS } from "../../data/finance";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { fundKey, fundKeyFromSource } from "../../utils/funds";


export function Directive() {
  const { C, st } = useTheme();
  const [approved, setApproved] = useState({});      // одобренное распределение по уровням
  const [calculated, setCalculated] = useState({});  // рассчитанное распределение
  const [role, setRole] = useState("committee");
  const canApprove = true;

  // Неделя: смещение в неделях от базовой (0 = 04–10 июн 2026)
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const rangeFor = (offset) => {
    const base = new Date(2026, 5, 4);
    const start = new Date(base); start.setDate(base.getDate() + offset * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const d = (x) => `${x.getDate()} ${MON[x.getMonth()]}`;
    return `${d(start)} – ${d(end)} ${end.getFullYear()}`;
  };
  const weekRange = useMemo(() => rangeFor(weekOffset), [weekOffset]);
  const weekOptions = useMemo(() => {
    const arr = [];
    for (let o = 8; o >= -8; o--) arr.push({ offset: o, label: rangeFor(o) });
    return arr;
  }, []);

  // Доход на этой неделе — сумма "Стало" из раздела Доходы
  const weekIncome = useMemo(() => INCOME_TREE.reduce((a, f) => a + f.cur, 0), []);
  const prevWeekIncome = useMemo(() => INCOME_TREE.reduce((a, f) => a + f.prev, 0), []);
  const requestsTotal = useMemo(() => REQUEST_GROUPS.reduce((a, g) => a + g.items.reduce((s, it) => s + it.amount, 0), 0), []);

  // Стартовый остаток каждого фонда (по коду). Берём available из всех уровней.
  const baseBalances = useMemo(() => {
    const b = {};
    FUND_LEVELS.forEach((lv) => lv.funds.forEach((f) => { const k = fundKey(f.code); b[k] = (b[k] || 0) + f.available; }));
    return b;
  }, []);

  // Сколько одобренного распределения добавлено в каждый фонд
  const distributed = useMemo(() => {
    const d = {};
    FUND_LEVELS.forEach((lv) => {
      const ap = approved[lv.id] || {};
      lv.funds.forEach((f, i) => { if (ap[i]) { const k = fundKey(f.code); d[k] = (d[k] || 0) + ap[i]; } });
    });
    return d;
  }, [approved]);

  // Списания по одобренным заявкам (поднимаем из RequestsPanel)
  const [spent, setSpent] = useState({}); // { FD4: сумма, ... }

  // Редактируемые проценты фондов: { "revenue-0": 5, ... } иначе берём из данных
  const [pcts, setPcts] = useState({});
  const pctOf = (lvId, i, f) => (pcts[`${lvId}-${i}`] !== undefined ? pcts[`${lvId}-${i}`] : f.pct);
  const setPct = (lvId, i, val) => setPcts((p) => ({ ...p, [`${lvId}-${i}`]: val }));

  // Текущий доступный остаток фонда = старт + распределено − потрачено
  const balanceOf = (k) => (baseBalances[k] || 0) + (distributed[k] || 0) - (spent[k] || 0);

  // Сумма доступного по всем уникальным фондам
  const totalAvailable = useMemo(() => {
    const keys = new Set();
    FUND_LEVELS.forEach((lv) => lv.funds.forEach((f) => keys.add(fundKey(f.code))));
    let t = 0; keys.forEach((k) => (t += balanceOf(k))); return t;
  }, [distributed, spent]);

  const grandApproved = useMemo(() => { let t = 0; Object.values(approved).forEach((lv) => Object.values(lv).forEach((v) => (t += v))); return t; }, [approved]);

  const [requestsBlocked, setRequestsBlocked] = useState(false);
  const [periodClosed, setPeriodClosed] = useState(false);

  const recalc = (lv) => setCalculated((p) => { const n = { ...p }; n[lv.id] = {}; lv.funds.forEach((f, i) => (n[lv.id][i] = (weekIncome * pctOf(lv.id, i, f)) / 100)); return n; });
  const approve = (lv) => { if (!canApprove) return; setApproved((p) => ({ ...p, [lv.id]: { ...(calculated[lv.id] || {}) } })); };
  const reset = (lv) => { setCalculated((p) => ({ ...p, [lv.id]: {} })); setApproved((p) => ({ ...p, [lv.id]: {} })); };

  const fpDistribute = weekIncome;
  const fpRemainder = weekIncome - grandApproved;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Директива · недельное распределение ФРС</div>
            <div style={st.weekPickerWrap}>
              <button style={st.weekBtn} className="btn" onClick={() => setWeekPickerOpen((v) => !v)}>
                <CalendarDays size={18} />
                <span style={st.heroTitle}>{weekRange}</span>
                <ChevronDown size={16} style={{ transform: weekPickerOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {weekPickerOpen && (
                <>
                  <div style={st.weekOverlay} onClick={() => setWeekPickerOpen(false)} />
                  <div style={st.weekMenu}>
                    <div style={st.weekMenuHead}>Выберите неделю</div>
                    {weekOptions.map((w) => (
                      <button key={w.offset} style={{ ...st.weekOption, ...(w.offset === weekOffset ? st.weekOptionOn : {}) }} className="weekOpt"
                        onClick={() => { setWeekOffset(w.offset); setWeekPickerOpen(false); }}>
                        <span>{w.label}</span>
                        {w.offset === 0 && <span style={st.weekTag}>текущая</span>}
                        {w.offset === weekOffset && <Check size={15} color={C.green} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Доход на этой неделе" value={fmt(weekIncome)} unit="TJS" />
          <Stat label="Доступно во всех фондах" value={fmt(totalAvailable)} unit="TJS" accent />
          <Stat label="Доход за прошлую неделю" value={fmt(prevWeekIncome)} unit="TJS" />
          <Stat label="Сумма заявок" value={fmt(requestsTotal)} unit="TJS" />
        </div>
      </div>
    </section>
    {FUND_LEVELS.map((lv) => (
      <LevelCard key={lv.id} level={lv} weekIncome={weekIncome} balanceOf={balanceOf}
        pctOf={pctOf} setPct={setPct}
        calculated={calculated[lv.id] || {}} approved={approved[lv.id] || {}}
        canApprove={canApprove} onCalc={() => recalc(lv)} onApprove={() => approve(lv)} onReset={() => reset(lv)} />
    ))}

    {/* Итог распределения на ФП */}
    <section style={st.fpCard}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Сумма к распределению на ФП</span><span style={st.fpValBold}>{fmt(fpDistribute)}</span></div>
        <div style={st.fpRow}><span style={st.fpLabel}>Распределено по фондам</span><span style={st.fpVal}>{fmt(grandApproved)}</span></div>
        <div style={{ ...st.fpRow, ...st.fpRemainder }}><span style={st.fpLabelBold}>Остаток нераспределённого</span><span style={{ ...st.fpValBold, color: C.green }}>{fmt(fpRemainder)}</span></div>
      </div>
      <div style={st.fpActions} className="fpActions">
        <button style={{ ...st.fpBtn, ...(requestsBlocked ? st.fpBtnDanger : st.fpBtnGhost) }} className="btn fpBtn" onClick={() => setRequestsBlocked((v) => !v)}>
          {requestsBlocked ? <><Lock size={15} /> Подача заявок запрещена</> : <><Ban size={15} /> Запретить подачу заявок</>}
        </button>
        <button style={{ ...st.fpBtn, ...(periodClosed ? st.fpBtnClosed : st.fpBtnPrimary) }} className="btn fpBtn" onClick={() => setPeriodClosed((v) => !v)}>
          {periodClosed ? <><Check size={15} /> Период ФП закрыт</> : <><Lock size={15} /> Закрыть период ФП</>}
        </button>
        <button style={{ ...st.fpBtn, ...st.fpBtnGhost }} className="btn fpBtn"><ArrowRightLeft size={15} /> Перенести остатки в фонд</button>
      </div>
    </section>

    <RequestsPanel blocked={requestsBlocked} balanceOf={balanceOf} spent={spent} setSpent={setSpent} />
  </>);
}


export function LevelCard({ level, weekIncome, balanceOf, pctOf, setPct, calculated, approved, canApprove, onCalc, onApprove, onReset }) {
  const { C, st, isMobile } = useTheme();
  const [busy, setBusy] = useState(null); // 'calc' | 'approve' | null
  const [justCalc, setJustCalc] = useState(false);
  const [justAppr, setJustAppr] = useState(false);
  const avail = (f) => balanceOf(fundKey(f.code));
  const totals = useMemo(() => { let a=0,c=0,ap=0; level.funds.forEach((f,i)=>{a+=avail(f);c+=calculated[i]||0;ap+=approved[i]||0;}); return {a,c,ap}; }, [level, calculated, approved, balanceOf]);

  const doCalc = () => { setBusy("calc"); setTimeout(() => { onCalc(); setBusy(null); setJustCalc(true); setTimeout(() => setJustCalc(false), 400); }, 450); };
  const doApprove = () => { if (!canApprove) return; setBusy("approve"); setTimeout(() => { onApprove(); setBusy(null); setJustAppr(true); setTimeout(() => setJustAppr(false), 400); }, 450); };

  const CalcBtn = ({ mobile }) => (
    <button style={st.btnGhost} onClick={doCalc} className="btn" disabled={busy}>
      {busy === "calc" ? <span className="spin"><RotateCw size={15} /></span> : <Calculator size={15} />} Рассчитать
    </button>
  );
  const ApproveBtn = () => (
    <button style={{ ...st.btnGreen, opacity: canApprove ? (busy ? 0.7 : 1) : 0.35, cursor: canApprove ? "pointer" : "not-allowed" }} onClick={doApprove} className="btn" disabled={busy || !canApprove}>
      {busy === "approve" ? <span className="spin"><RotateCw size={15} /></span> : <Check size={15} />} Одобрить
    </button>
  );
  const ResetBtn = () => (<button style={st.btnGhost} onClick={onReset} className="btn"><RotateCcw size={14} /> Сброс</button>);
  return (
    <div style={st.cardWrap}>
    <section style={st.card}>
      <div style={st.cardHead}><div style={st.cardTitle}>{level.title}</div><div style={st.cardTotal}>{fmt(weekIncome)} <span style={st.unit}>TJS</span></div></div>
      <div style={st.subHead}><span style={st.subHeadTitle}>{level.fundsTitle}</span><span style={st.subHeadAppr}>Одобрено: <b style={{ color: C.green }}>{fmt(totals.ap)}</b></span></div>
      {level.funds.length === 0 ? <div style={st.empty}>Фонды этого уровня ещё не настроены</div> : (<>
        <div style={{ ...st.frow, ...st.frowHead }}><div style={st.fName}>Название</div><div style={st.fPct}>%</div><div style={st.fNum}>Доступно</div><div style={st.fNum}>Рассчитано</div><div style={st.fNum}>Одобрено</div></div>
        {level.funds.map((f, i) => { const a = avail(f); const pct = pctOf(level.id, i, f); const calc = calculated[i]||0, appr = approved[i]||0;
          const baseBefore = (a - appr) > 0 ? (a - appr) : (calc || appr || 1); // доступно ДО распределения
          const barVal = appr || calc;
          const barColor = appr ? C.green : "#e8911c";
          const fill = barVal > 0 ? Math.min(100, (barVal / baseBefore) * 100) : 0;
          return (
          <div key={f.code+i} style={st.frow} className="frow">
            <div style={st.fName}><div style={st.fundTop}><span style={st.fundCode}>{f.code}</span><span>{f.name}</span></div><div style={st.bar}><div style={{ ...st.barFill, width: `${fill}%`, background: barColor }} /></div></div>
            <div style={st.fPct}>{pctOf(level.id, i, f)}%</div>
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(a)}</div>
            <div style={{ ...st.fNum, color: calc?"#e8911c":C.faint, fontWeight: calc?600:400 }}><span className={justCalc && calc ? "pop" : ""}>{fmt(calc)}</span></div>
            <div style={{ ...st.fNum, color: appr?C.green:C.faint, fontWeight: appr?700:400 }}><span className={justAppr && appr ? "pop" : ""}>{fmt(appr)}</span></div>
          </div>); })}
        <div style={{ ...st.frow, ...st.frowTotal }}>
          {isMobile ? <div style={st.fName}><b>Итого</b></div> : (
            <div style={st.fName}><div style={st.actions}><CalcBtn /><ApproveBtn /><ResetBtn /></div></div>
          )}
          <div style={st.fPct} /><div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.a)}</div><div style={{ ...st.fNum, fontWeight: 700, color: totals.c?"#e8911c":C.faint }}>{fmt(totals.c)}</div><div style={{ ...st.fNum, fontWeight: 700, color: C.green }}>{fmt(totals.ap)}</div>
        </div>
        {isMobile && (
          <div style={st.mActions}><CalcBtn /><ApproveBtn /><ResetBtn /></div>
        )}
      </>)}
    </section>
    </div>
  );
}


// ---------------------------------------------------------------- REQUESTS
export function RequestsPanel({ blocked, balanceOf, spent, setSpent }) {
  const { C, st, isMobile } = useTheme();
  const [items, setItems] = useState(() => {
    const m = {};
    REQUEST_GROUPS.forEach((g) => g.items.forEach((it) => { m[it.id] = { status: it.status, fund: it.fund, comment: "", amount: it.amount }; }));
    return m;
  });
  const [filter, setFilter] = useState("review");
  const [open, setOpen] = useState(() => { const o = {}; REQUEST_GROUPS.forEach((g) => (o[g.id] = true)); return o; });
  const [errors, setErrors] = useState({}); // { id: "текст ошибки" }

  const allItems = useMemo(() => { const m = {}; REQUEST_GROUPS.forEach((g) => g.items.forEach((it) => (m[it.id] = it))); return m; }, []);

  const setStatus = (id, status) => {
    const cur = items[id];
    const amt = Number(cur.amount) || 0;
    // снять статус повторным кликом — возвращаем деньги в фонд если были списаны
    if (cur.status === status) {
      if (status === "approved") setSpent((s) => ({ ...s, [fundKeyFromSource(cur.fund)]: (s[fundKeyFromSource(cur.fund)] || 0) - amt }));
      setItems((s) => ({ ...s, [id]: { ...s[id], status: "review" } }));
      setErrors((e) => ({ ...e, [id]: null }));
      return;
    }
    if (status === "approved") {
      if (blocked) { setErrors((e) => ({ ...e, [id]: "Подача заявок закрыта" })); return; }
      const key = fundKeyFromSource(cur.fund);
      const balance = balanceOf(key);
      if (amt <= 0) { setErrors((e) => ({ ...e, [id]: "Укажите сумму больше нуля" })); return; }
      if (amt > balance) {
        setErrors((e) => ({ ...e, [id]: `Недостаточно средств в фонде ${cur.fund} · доступно ${fmt(balance)}` }));
        return; // заявка остаётся на месте, статус не меняется
      }
      setSpent((s) => ({ ...s, [key]: (s[key] || 0) + amt }));
    } else if (cur.status === "approved") {
      setSpent((s) => ({ ...s, [fundKeyFromSource(cur.fund)]: (s[fundKeyFromSource(cur.fund)] || 0) - amt }));
    }
    setErrors((e) => ({ ...e, [id]: null }));
    setItems((s) => ({ ...s, [id]: { ...s[id], status } }));
  };

  const setField = (id, key, val) => {
    setItems((s) => {
      const cur = s[id];
      if (cur.status === "approved") {
        const oldAmt = Number(cur.amount) || 0;
        if (key === "fund") {
          setSpent((sp) => ({ ...sp, [fundKeyFromSource(cur.fund)]: (sp[fundKeyFromSource(cur.fund)] || 0) - oldAmt, [fundKeyFromSource(val)]: (sp[fundKeyFromSource(val)] || 0) + oldAmt }));
        } else if (key === "amount") {
          const newAmt = Number(val) || 0;
          const k = fundKeyFromSource(cur.fund);
          setSpent((sp) => ({ ...sp, [k]: (sp[k] || 0) - oldAmt + newAmt }));
        }
      }
      return { ...s, [id]: { ...cur, [key]: val } };
    });
  };

  const counts = useMemo(() => {
    const c = { all: 0, approved: 0, rejected: 0, review: 0 };
    Object.values(items).forEach((it) => { c.all++; c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }, [items]);

  // Итоги по суммам (по введённым значениям)
  const sumTotals = useMemo(() => {
    let total = 0, approved = 0;
    Object.values(items).forEach((it) => { const a = Number(it.amount) || 0; total += a; if (it.status === "approved") approved += a; });
    return { total, approved };
  }, [items]);

  const TABS = [
    { key: "all", label: "Все", n: counts.all },
    { key: "review", label: "К рассмотрению на ФП", n: counts.review },
    { key: "approved", label: "Одобрено", n: counts.approved },
    { key: "rejected", label: "Отклонено", n: counts.rejected },
  ];

  const show = (it) => filter === "all" || items[it.id].status === filter;

  const STATUS_META = {
    review: { label: "К рассмотрению", color: C.sub, bg: C.panel2 },
    approved: { label: "Одобрено", color: C.green, bg: `${C.green}1a` },
    rejected: { label: "Отклонено", color: C.danger, bg: `${C.danger}1a` },
  };

  return (
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки к рассмотрению</h3>
        <span style={st.reqSectionSub}>Финкомитет одобряет или отклоняет</span>
        {blocked && <span style={st.reqBlockedTag}><Lock size={12} /> Подача закрыта</span>}
      </div>

      <div style={st.reqTabs}>
        {TABS.map((t) => (
          <button key={t.key} style={{ ...st.reqTab, ...(filter === t.key ? st.reqTabOn : {}) }} onClick={() => setFilter(t.key)} className="btn">
            {t.label} <span style={st.reqTabN}>{t.n}</span>
          </button>
        ))}
      </div>

      <div style={st.incList}>
        {REQUEST_GROUPS.map((g) => {
          const visible = g.items.filter(show);
          if (visible.length === 0) return null;
          const groupSum = visible.reduce((a, it) => a + it.amount, 0);
          const isOpen = !!open[g.id];
          return (
            <div key={g.id} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                <div style={{ ...st.locDot, background: g.color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>{g.name}</div>
                  <div style={st.locCode}>Отделение {g.code} · {visible.length} заявок</div>
                </div>
                <div style={st.locRight}>
                  <div style={st.locSum}>{fmt(groupSum)} <span style={st.locUnit}>TJS</span></div>
                </div>
                <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
              </div>

              {isOpen && (
                <div style={st.locBody}>
                  {visible.map((it) => {
                    const cur = items[it.id];
                    const sm = STATUS_META[cur.status];
                    return (
                      <div key={it.id} style={st.reqRow}>
                        <div style={st.reqMain}>
                          <img style={st.reqAvatar} src={`https://i.pravatar.cc/96?img=${it.photo}`} alt="" />
                          <div style={st.reqInfo}>
                            <div style={st.reqTitle}><span style={st.itemCode}>{it.id}</span> · <span style={{ color: C.blueLink }}>{it.code} — {it.title}</span></div>
                            <div style={st.reqMeta}>{it.role}</div>
                            <div style={st.reqMeta}>Вид расхода: {it.kind}</div>
                          </div>
                          <div style={st.reqAmountBox}>
                            <div style={st.reqAmountEdit}>
                              <input
                                type="number" inputMode="decimal" value={cur.amount}
                                onChange={(e) => setField(it.id, "amount", e.target.value === "" ? "" : Number(e.target.value))}
                                onWheel={(e) => e.target.blur()}
                                style={st.reqAmountInput} className="amtIn"
                              />
                              <span style={st.reqAmountCur}>TJS</span>
                            </div>
                            {Number(cur.amount) !== it.amount && <span style={st.reqAmountOrig}>заявлено {fmt(it.amount)}</span>}
                            <span style={{ ...st.reqBadge, color: sm.color, background: sm.bg }}>{sm.label}</span>
                          </div>
                        </div>

                        <div style={st.reqControls}>
                          <label style={st.reqField}>
                            <span style={st.reqFieldLbl}>Фонд (источник) · доступно {fmt(balanceOf(fundKeyFromSource(cur.fund)))}</span>
                            <select style={st.reqSelect} value={cur.fund} onChange={(e) => setField(it.id, "fund", e.target.value)}>
                              {FUND_SOURCES.map((f) => <option key={f}>{f}</option>)}
                            </select>
                          </label>
                          <div style={st.reqActions}>
                            <button style={{ ...st.reqAct, ...(cur.status === "approved" ? st.reqActApprOn : st.reqActAppr) }} onClick={() => setStatus(it.id, "approved")} title="Одобрить" className="reqActB"><CheckCircle2 size={18} /></button>
                            <button style={{ ...st.reqAct, ...(cur.status === "rejected" ? st.reqActRejOn : st.reqActRej) }} onClick={() => setStatus(it.id, "rejected")} title="Отклонить" className="reqActB"><XCircle size={18} /></button>
                            <button style={{ ...st.reqAct, ...st.reqActBack }} onClick={() => setStatus(it.id, "review")} title="Вернуть на рассмотрение" className="reqActB"><RotateCw size={16} /></button>
                          </div>
                        </div>

                        {errors[it.id] && <div style={st.reqError}><Ban size={14} /> {errors[it.id]}</div>}

                        <label style={st.reqCommentWrap}>
                          <span style={st.reqFieldLbl}>Комментарий Финкомитета</span>
                          <textarea style={st.reqComment} rows={2} placeholder="Причина решения, условия оплаты, примечание…" value={cur.comment} onChange={(e) => setField(it.id, "comment", e.target.value)} />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={st.reqTotalBar}>
        <span style={st.reqTotalLabel}>Итого заявок · {counts.all}</span>
        <div style={st.reqTotalRight}>
          <span style={st.reqTotalApproved}>Одобрено: <b>{fmt(sumTotals.approved)}</b></span>
          <span style={st.reqTotalSum}>{fmt(sumTotals.total)} <span style={st.locUnit}>TJS</span></span>
        </div>
      </div>
    </section>
  );
}
