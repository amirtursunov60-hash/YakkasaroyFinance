import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, Plus, X, Pencil, Trash2,
  Coins, ArrowRightLeft, ChevronRight, Star,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchCurrencies, createCurrency, updateCurrency, setBaseCurrency,
  fetchExchangeRates, createExchangeRate, updateExchangeRate, deleteExchangeRate, isoDate,
} from "../../lib/api";

const wrapRls = (e, what) => {
  const msg = e?.message || String(e);
  return msg.includes("row-level security") ? `Нет прав на изменение ${what}.` : msg;
};

// ---------------------------------------------------------------- ВАЛЮТЫ (§3)
// Справочник валют. CRUD под RLS currencies_insert/update = is_fin_admin().
// Базовая валюта — атомарно через RPC fp_set_base_currency.
export function CurrenciesManager() {
  const { C, st, isMobile } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows(await fetchCurrencies()); setLoaded(true); }
    catch (e) { setErr("Не удалось загрузить валюты: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const doAdd = async () => {
    const code = addCode.trim(), name = addName.trim();
    if (busy || !code || !name) return;
    setBusy("add"); setErr(""); setDone("");
    try {
      await createCurrency({ code, name });
      setAddCode(""); setAddName(""); await load();
      setDone(`Валюта ${code} добавлена`);
    } catch (e) { setErr(wrapRls(e, "справочника валют")); }
    finally { setBusy(null); }
  };

  const doSave = async (cur) => {
    const code = editCode.trim(), name = editName.trim();
    if (busy || !code || !name) return;
    setBusy(`ed:${cur.id}`); setErr(""); setDone("");
    try {
      await updateCurrency(cur.id, { code, name });
      setEditId(null); await load(); setDone("Сохранено");
    } catch (e) { setErr(wrapRls(e, "справочника валют")); }
    finally { setBusy(null); }
  };

  const doSetBase = async (cur) => {
    if (busy || cur.is_base) return;
    if (!window.confirm(`Сделать «${cur.code}» базовой валютой?\n\nБазовая валюта определяет, как считается сумма в базовой валюте (amount_base) для всех операций. Меняйте только осознанно.`)) return;
    setBusy(`base:${cur.id}`); setErr(""); setDone("");
    try { await setBaseCurrency(cur.id); await load(); setDone(`Базовая валюта — ${cur.code}`); }
    catch (e) { setErr(wrapRls(e, "базовой валюты")); }
    finally { setBusy(null); }
  };

  return (
    <section style={{ ...st.fpCard, marginTop: 18, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <Coins size={17} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Валюты</span>
        {loaded && <span style={{ fontSize: 12, color: C.faint }}>{rows.length}</span>}
        <ChevronRight size={18} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
          {done && <div style={{ ...st.reqSuccess, marginBottom: 12 }}><CheckCircle2 size={15} /> {done}</div>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...st.mdInput, flex: "0 1 110px", minWidth: 0 }} className="fin" value={addCode}
              onChange={(e) => setAddCode(e.target.value.toUpperCase())} maxLength={8}
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }} placeholder="Код (USD)" aria-label="Код валюты" />
            <input style={{ ...st.mdInput, flex: "1 1 180px", minWidth: 0 }} className="fin" value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }} placeholder="Название (Доллар США)" aria-label="Название валюты" />
            <button style={st.btnGreen} className="btn" onClick={doAdd} disabled={busy === "add" || !addCode.trim() || !addName.trim()}>
              {busy === "add" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
            </button>
          </div>

          {loading && <div style={{ ...st.empty, padding: "14px 0" }}><Loader2 size={16} className="spin" /> Загрузка…</div>}
          {!loading && !rows.length && <div style={{ ...st.empty, padding: "14px 0" }}>Валют пока нет</div>}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {rows.map((cur) => {
              const isEdit = editId === cur.id;
              return (
                <div key={cur.id} style={{ ...st.locCard, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  {isEdit ? (
                    <>
                      <input style={{ ...st.mdInput, flex: "0 1 80px", minWidth: 0 }} className="fin" value={editCode}
                        onChange={(e) => setEditCode(e.target.value.toUpperCase())} maxLength={8} autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") doSave(cur); if (e.key === "Escape") setEditId(null); }} />
                      <input style={{ ...st.mdInput, flex: 1, minWidth: 0 }} className="fin" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doSave(cur); if (e.key === "Escape") setEditId(null); }} />
                      <button className="btn" aria-label="Сохранить" disabled={busy === `ed:${cur.id}`}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, padding: 4 }} onClick={() => doSave(cur)}>
                        {busy === `ed:${cur.id}` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      </button>
                      <button className="btn" aria-label="Отмена" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }} onClick={() => setEditId(null)}><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ ...st.fundCode, flexShrink: 0 }}>{cur.code}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.name}</span>
                      {cur.is_base
                        ? <span style={{ ...st.weekTag, marginLeft: 0, color: C.green, background: `${C.green}1a`, display: "inline-flex", alignItems: "center", gap: 3 }}><Star size={10} /> базовая</span>
                        : (
                          <button className="btn" aria-label="Сделать базовой" title="Сделать базовой" disabled={busy === `base:${cur.id}`}
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }} onClick={() => doSetBase(cur)}>
                            {busy === `base:${cur.id}` ? <Loader2 size={14} className="spin" /> : <Star size={14} />}
                          </button>
                        )}
                      <button className="btn" aria-label="Изменить" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                        onClick={() => { setEditId(cur.id); setEditCode(cur.code); setEditName(cur.name); }}><Pencil size={14} /></button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}


// ---------------------------------------------------------------- КУРСЫ (§4)
// Справочник курсов обмена. Курс хранится парой (from→to) на дату действия.
// CRUD под RLS rates_insert/update/delete.
export function ExchangeRatesManager() {
  const { C, st, isMobile } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [rows, setRows] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ fromCurId: "", toCurId: "", rate: "", validFrom: isoDate(new Date()) });
  const [editId, setEditId] = useState(null);
  const [editRate, setEditRate] = useState("");
  const [editDate, setEditDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [rs, cs] = await Promise.all([fetchExchangeRates(), fetchCurrencies()]);
      setRows(rs); setCurrencies(cs); setLoaded(true);
      const base = cs.find((c) => c.is_base);
      setForm((f) => ({ ...f, toCurId: f.toCurId || base?.id || "", fromCurId: f.fromCurId || cs.find((c) => !c.is_base)?.id || "" }));
    } catch (e) { setErr("Не удалось загрузить курсы: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const curCode = (id) => currencies.find((c) => c.id === id)?.code || "?";

  const doAdd = async () => {
    const rate = parseFloat(String(form.rate).replace(",", "."));
    if (busy) return;
    if (!form.fromCurId || !form.toCurId) return setErr("Выберите пару валют");
    if (form.fromCurId === form.toCurId) return setErr("Валюты должны различаться");
    if (!Number.isFinite(rate) || rate <= 0) return setErr("Курс — число больше нуля");
    if (!form.validFrom) return setErr("Укажите дату действия");
    setBusy("add"); setErr(""); setDone("");
    try {
      await createExchangeRate({ fromCurId: form.fromCurId, toCurId: form.toCurId, rate, validFrom: form.validFrom });
      setForm((f) => ({ ...f, rate: "" })); await load();
      setDone("Курс добавлен");
    } catch (e) { setErr(wrapRls(e, "курсов валют")); }
    finally { setBusy(null); }
  };

  const doSave = async (r) => {
    const rate = parseFloat(String(editRate).replace(",", "."));
    if (busy) return;
    if (!Number.isFinite(rate) || rate <= 0) return setErr("Курс — число больше нуля");
    if (!editDate) return setErr("Укажите дату");
    setBusy(`ed:${r.id}`); setErr(""); setDone("");
    try { await updateExchangeRate(r.id, { rate, valid_from: editDate }); setEditId(null); await load(); setDone("Сохранено"); }
    catch (e) { setErr(wrapRls(e, "курсов валют")); }
    finally { setBusy(null); }
  };

  const doDelete = async (r) => {
    if (busy) return;
    if (!window.confirm(`Удалить курс ${curCode(r.from_cur_id)} → ${curCode(r.to_cur_id)} от ${r.valid_from}?`)) return;
    setBusy(`del:${r.id}`); setErr(""); setDone("");
    try { await deleteExchangeRate(r.id); await load(); setDone("Курс удалён"); }
    catch (e) { setErr(wrapRls(e, "курсов валют")); }
    finally { setBusy(null); }
  };

  const fld = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section style={{ ...st.fpCard, marginTop: 18, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <ArrowRightLeft size={17} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Курсы валют</span>
        {loaded && <span style={{ fontSize: 12, color: C.faint }}>{rows.length}</span>}
        <ChevronRight size={18} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
          {done && <div style={{ ...st.reqSuccess, marginBottom: 12 }}><CheckCircle2 size={15} /> {done}</div>}

          {/* Добавление курса */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <select style={{ ...st.mdSelect, flex: "1 1 120px" }} className="fin" value={form.fromCurId} onChange={fld("fromCurId")} aria-label="Из валюты">
              <option value="">— из —</option>
              {currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
            <ArrowRightLeft size={14} color={C.faint} style={{ flexShrink: 0 }} />
            <select style={{ ...st.mdSelect, flex: "1 1 120px" }} className="fin" value={form.toCurId} onChange={fld("toCurId")} aria-label="В валюту">
              <option value="">— в —</option>
              {currencies.map((c) => <option key={c.id} value={c.id}>{c.code}{c.is_base ? " (базовая)" : ""}</option>)}
            </select>
            <input style={{ ...st.mdInput, flex: "0 1 110px", minWidth: 0 }} className="fin" inputMode="decimal" value={form.rate}
              onChange={fld("rate")} onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }} placeholder="Курс" aria-label="Курс" />
            <input type="date" style={{ ...st.mdInput, flex: "0 1 150px", minWidth: 0 }} className="fin" value={form.validFrom} onChange={fld("validFrom")} aria-label="Дата действия" />
            <button style={st.btnGreen} className="btn" onClick={doAdd} disabled={busy === "add"}>
              {busy === "add" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
            </button>
          </div>

          {loading && <div style={{ ...st.empty, padding: "14px 0" }}><Loader2 size={16} className="spin" /> Загрузка…</div>}
          {!loading && !rows.length && <div style={{ ...st.empty, padding: "14px 0" }}>Курсов пока нет — добавьте первый</div>}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {rows.map((r) => {
              const isEdit = editId === r.id;
              return (
                <div key={r.id} style={{ ...st.locCard, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700 }}>{r.from_cur?.code || curCode(r.from_cur_id)} → {r.to_cur?.code || curCode(r.to_cur_id)}</span>
                  {isEdit ? (
                    <>
                      <input style={{ ...st.mdInput, flex: "0 1 90px", minWidth: 0 }} className="fin" inputMode="decimal" value={editRate} autoFocus
                        onChange={(e) => setEditRate(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doSave(r); if (e.key === "Escape") setEditId(null); }} />
                      <input type="date" style={{ ...st.mdInput, flex: "1 1 130px", minWidth: 0 }} className="fin" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                      <button className="btn" aria-label="Сохранить" disabled={busy === `ed:${r.id}`} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, padding: 4 }} onClick={() => doSave(r)}>
                        {busy === `ed:${r.id}` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      </button>
                      <button className="btn" aria-label="Отмена" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }} onClick={() => setEditId(null)}><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rate}</span>
                      <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>с {r.valid_from}</span>
                      <button className="btn" aria-label="Изменить" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                        onClick={() => { setEditId(r.id); setEditRate(String(r.rate)); setEditDate(r.valid_from); }}><Pencil size={14} /></button>
                      <button className="btn" aria-label="Удалить" disabled={busy === `del:${r.id}`} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.danger, padding: 4 }} onClick={() => doDelete(r)}>
                        {busy === `del:${r.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
