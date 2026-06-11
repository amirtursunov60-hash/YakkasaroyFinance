import { useState, useMemo } from "react";
import { RotateCcw, Ban, ArrowRightLeft, Clock } from "lucide-react";
import { Stat } from "../../components/common";
import { FUND_LEVELS } from "../../data/finance";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { fundKey } from "../../utils/funds";


// ---------------------------------------------------------------- FUNDS (новый раздел по ТЗ 3.1.3)
export function Funds() {
  const { C, st } = useTheme();
  // Сводим фонды со всех уровней в один список (FD6 встречается на двух уровнях — суммируем)
  const list = useMemo(() => {
    const map = new Map();
    FUND_LEVELS.forEach((lv) => lv.funds.forEach((f) => {
      const k = fundKey(f.code);
      if (map.has(k)) { map.get(k).start += f.available; map.get(k).levels.push(lv.title); }
      else map.set(k, { key: k, code: f.code, name: f.name, levels: [lv.title], start: f.available, type: k === "FD6" ? "накопительный" : "рабочий" });
    }));
    return [...map.values()];
  }, []);

  const [balances, setBalances] = useState(() => {
    const b = {};
    FUND_LEVELS.forEach((lv) => lv.funds.forEach((f) => { const k = fundKey(f.code); b[k] = (b[k] || 0) + f.available; }));
    return b;
  });
  const [history, setHistory] = useState([]);
  const [from, setFrom] = useState("FD6");
  const [to, setTo] = useState("FD3");
  const [amt, setAmt] = useState("");
  const [kind, setKind] = useState("move"); // move | loan
  const [err, setErr] = useState("");

  const nameOf = (k) => { const f = list.find((x) => x.key === k); return f ? `${f.code} — ${f.name}` : k; };
  const total = useMemo(() => Object.values(balances).reduce((a, v) => a + v, 0), [balances]);
  const working = list.filter((f) => f.type === "рабочий");
  const saving = list.filter((f) => f.type === "накопительный");

  const doTransfer = () => {
    const a = Number(amt) || 0;
    if (a <= 0) { setErr("Укажите сумму больше нуля"); return; }
    if (from === to) { setErr("Выберите два разных фонда"); return; }
    if (a > balances[from]) { setErr(`Недостаточно средств в фонде ${nameOf(from)} · доступно ${fmt(balances[from])}`); return; }
    setBalances((b) => ({ ...b, [from]: b[from] - a, [to]: b[to] + a }));
    setHistory((h) => [{ id: Date.now(), from, to, amt: a, kind, returned: false, date: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }, ...h]);
    setAmt(""); setErr("");
  };

  const doReturn = (op) => {
    if (op.amt > balances[op.to]) { setErr(`Нельзя вернуть заём: в фонде ${nameOf(op.to)} недостаточно средств`); return; }
    setBalances((b) => ({ ...b, [op.to]: b[op.to] - op.amt, [op.from]: b[op.from] + op.amt }));
    setHistory((h) => h.map((x) => (x.id === op.id ? { ...x, returned: true } : x)));
    setErr("");
  };

  const selStyle = { ...st.reqSelect, minWidth: 200 };
  const typeBadge = (t) => ({
    fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap",
    color: t === "рабочий" ? C.green : "#5b8def",
    background: t === "рабочий" ? `${C.green}1a` : "#5b8def1a",
  });

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Фонды · запасы средств по целям</div><div style={st.heroTitle}>Все фонды компании</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Всего в фондах" value={fmt(total)} unit="TJS" accent />
          <Stat label="Рабочих фондов" value={String(working.length)} unit="" />
          <Stat label="Накопительных" value={String(saving.length)} unit="" />
          <Stat label="Операций за сессию" value={String(history.length)} unit="" />
        </div>
      </div>
    </section>

    {/* Операция: перемещение / заём */}
    <section style={st.fpCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <ArrowRightLeft size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Операция между фондами</h3>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={st.reqField}>
          <span style={st.reqFieldLbl}>Тип операции</span>
          <select style={selStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="move">Перемещение</option>
            <option value="loan">Заём (с возвратом)</option>
          </select>
        </label>
        <label style={st.reqField}>
          <span style={st.reqFieldLbl}>Из фонда · доступно {fmt(balances[from] || 0)}</span>
          <select style={selStyle} value={from} onChange={(e) => setFrom(e.target.value)}>
            {list.map((f) => <option key={f.key} value={f.key}>{f.code} — {f.name}</option>)}
          </select>
        </label>
        <label style={st.reqField}>
          <span style={st.reqFieldLbl}>В фонд</span>
          <select style={selStyle} value={to} onChange={(e) => setTo(e.target.value)}>
            {list.map((f) => <option key={f.key} value={f.key}>{f.code} — {f.name}</option>)}
          </select>
        </label>
        <label style={st.reqField}>
          <span style={st.reqFieldLbl}>Сумма, TJS</span>
          <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
            onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
        </label>
        <button style={st.btnGreen} className="btn" onClick={doTransfer}>
          <ArrowRightLeft size={15} /> {kind === "move" ? "Переместить" : "Одолжить"}
        </button>
      </div>
      {err && <div style={st.reqError}><Ban size={14} /> {err}</div>}
    </section>

    {/* Список фондов */}
    <div style={{ ...st.cardWrap, marginTop: 18 }}>
      <section style={st.card}>
        <div style={st.cardHead}><div style={st.cardTitle}>Остатки по фондам</div><div style={st.cardTotal}>{fmt(total)} <span style={st.unit}>TJS</span></div></div>
        <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: "1fr 200px 140px 160px" }}>
          <div style={st.fName}>Фонд</div><div style={st.fPct}>Этап распределения</div><div style={st.fPct}>Тип</div><div style={st.fNum}>Доступно</div>
        </div>
        {list.map((f) => (
          <div key={f.key} style={{ ...st.frow, gridTemplateColumns: "1fr 200px 140px 160px" }} className="frow">
            <div style={st.fName}><div style={st.fundTop}><span style={st.fundCode}>{f.code}</span><span>{f.name}</span></div></div>
            <div style={{ ...st.fPct, fontSize: 12 }}>{f.levels.join(" + ")}</div>
            <div style={st.fPct}><span style={typeBadge(f.type)}>{f.type}</span></div>
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(balances[f.key] || 0)}</div>
          </div>
        ))}
      </section>
    </div>

    {/* История операций */}
    <section style={{ ...st.fpCard, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Clock size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>История операций</h3>
        <span style={st.reqSectionSub}>в этой сессии</span>
      </div>
      {history.length === 0 ? (
        <div style={st.empty}>Операций пока нет — переместите средства между фондами выше</div>
      ) : history.map((op) => (
        <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0, width: 86 }}>{op.date}</span>
          <span style={{ ...typeBadge(op.kind === "loan" ? "накопительный" : "рабочий"), color: op.kind === "loan" ? "#e8911c" : C.green, background: op.kind === "loan" ? "#e8911c1a" : `${C.green}1a` }}>
            {op.kind === "loan" ? "Заём" : "Перемещение"}
          </span>
          <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>{nameOf(op.from)} → {nameOf(op.to)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(op.amt)}</span>
          {op.kind === "loan" && !op.returned && (
            <button style={st.btnGhost} className="btn" onClick={() => doReturn(op)}><RotateCcw size={13} /> Вернуть</button>
          )}
          {op.kind === "loan" && op.returned && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub }}>возвращён</span>
          )}
        </div>
      ))}
    </section>
  </>);
}
