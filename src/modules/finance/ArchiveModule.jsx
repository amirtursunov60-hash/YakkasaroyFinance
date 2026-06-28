import { useState, useEffect, useCallback } from "react";
import {
  Archive, Layers, Boxes, ArrowDownLeft, ArrowUpRight, CreditCard, Building2,
  FileText, ClipboardList, RotateCcw, Loader2, AlertCircle, ChevronRight, CheckCircle2,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import {
  fetchArchivedFunds, unarchiveFund,
  fetchArchivedFundFolders, unarchiveFundFolder,
  fetchArchivedExpenseTypes, unarchiveExpenseType,
  fetchArchivedIncomeTypes, setIncomeTypeArchived,
  fetchArchivedPaymentTypes, setPaymentTypeArchived,
  fetchArchivedCounterparties, setCounterpartyArchived,
  fetchArchivedBills, unarchiveBill,
  fetchArchivedRequests, restoreRequest,
} from "../../lib/api";

// ---------------------------------------------------------------- АРХИВ
// Единая вкладка: архивные финансовые сущности с возможностью восстановить.
// Восстановление Реестр НЕ трогает (деньги в леджере остаются); справочники/
// счета — снятие is_archived, заявки — возврат в работу (status → submitted).

const REQ_STATUS = { withdrawn: "отозвана", rejected: "отклонена" };

const SECTIONS = [
  { key: "funds", title: "Фонды", icon: Layers,
    load: fetchArchivedFunds, restore: unarchiveFund,
    primary: (x) => `${x.code} — ${x.name}`,
    sub: (x) => `Остаток ${fmt(Number(x.balance || 0))} TJS` },
  { key: "folders", title: "Папки фондов", icon: Boxes,
    load: fetchArchivedFundFolders, restore: unarchiveFundFolder,
    primary: (x) => x.name },
  { key: "expense", title: "Статьи расходов", icon: ArrowDownLeft,
    load: fetchArchivedExpenseTypes, restore: unarchiveExpenseType,
    primary: (x) => `${x.code ? x.code + " " : ""}${x.name}` },
  { key: "income", title: "Виды дохода", icon: ArrowUpRight,
    load: fetchArchivedIncomeTypes, restore: (id) => setIncomeTypeArchived(id, false),
    primary: (x) => `${x.code ? x.code + " " : ""}${x.name}` },
  { key: "paytypes", title: "Способы оплаты", icon: CreditCard,
    load: fetchArchivedPaymentTypes, restore: (id) => setPaymentTypeArchived(id, false),
    primary: (x) => x.name },
  { key: "counterparties", title: "Контрагенты", icon: Building2,
    load: fetchArchivedCounterparties, restore: (id) => setCounterpartyArchived(id, false),
    primary: (x) => x.name },
  { key: "bills", title: "Счета поставщиков", icon: FileText,
    load: fetchArchivedBills, restore: unarchiveBill,
    primary: (x) => `№${x.number ?? "—"} · ${x.counterparty?.name || "—"}`,
    sub: (x) => `${fmt(Number(x.amount || 0))} TJS · ${x.status}` },
  { key: "requests", title: "Заявки (отозванные/отклонённые)", icon: ClipboardList,
    load: fetchArchivedRequests, restore: restoreRequest,
    primary: (x) => `№${x.number ?? "—"} · ${fmt(Number(x.planned_amount || 0))} TJS`,
    sub: (x) => REQ_STATUS[x.status] || x.status,
    note: "Восстановление вернёт заявку в работу (на рассмотрение)." },
];

export function ArchiveModule() {
  const { C, st, isMobile, profile } = useTheme();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const [data, setData] = useState({});      // { key: items[] }
  const [open, setOpen] = useState({});       // раскрытые разделы
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);     // `${key}:${id}`
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const loadAll = useCallback(async () => {
    setErr("");
    try {
      const entries = await Promise.all(SECTIONS.map(async (s) => [s.key, await s.load()]));
      setData(Object.fromEntries(entries));
    } catch (e) {
      setErr("Не удалось загрузить архив: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isFinAdmin) loadAll(); else setLoading(false); }, [loadAll, isFinAdmin]);

  const restore = async (s, item) => {
    if (busy) return;
    setBusy(`${s.key}:${item.id}`); setErr(""); setDone("");
    try {
      await s.restore(item.id);
      setData((d) => ({ ...d, [s.key]: (d[s.key] || []).filter((x) => x.id !== item.id) }));
      setDone(`Восстановлено: ${s.primary(item)}`);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setBusy(null); }
  };

  if (!isFinAdmin) {
    return <div style={{ ...st.dataCard, ...st.empty, padding: 28 }}>
      Архив доступен только финансовому директору и владельцу.
    </div>;
  }
  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка архива…</div>;

  const total = SECTIONS.reduce((a, s) => a + (data[s.key]?.length || 0), 0);

  return (<>
    {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={st.reqSuccess}><CheckCircle2 size={15} /> {done}</div>}

    <section style={st.incHero}>
      <div style={st.incHeroGlow} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Архив · восстановление финансовых записей</div>
          <div style={st.incHeroValue}>{total} <span style={st.incHeroUnit}>в архиве</span></div>
          <div style={st.incHeroSub}>История в Реестре сохраняется — восстановление возвращает запись в работу.</div>
        </div>
        <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", background: `${C.warning}22`, color: C.warning, flexShrink: 0 }}>
          <Archive size={22} />
        </div>
      </div>
    </section>

    {total === 0 && <div style={{ ...st.dataCard, ...st.empty, marginTop: 14 }}>Архив пуст — заархивированных записей нет.</div>}

    <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
      {SECTIONS.map((s) => {
        const items = data[s.key] || [];
        if (!items.length) return null;
        const isOpen = !!open[s.key];
        const Icon = s.icon;
        return (
          <div key={s.key} style={st.dataCard}>
            <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${C.sub}22`, color: C.sub }}>
                <Icon size={18} />
              </div>
              <div style={st.locTitle}>
                <div style={st.locName}>{s.title}</div>
                <div style={st.locCode}>{items.length} в архиве</div>
              </div>
              <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>
            {isOpen && (
              <div style={st.locBody}>
                {s.note && <div style={{ fontSize: 11.5, color: C.faint, padding: "8px 14px 0" }}>{s.note}</div>}
                {items.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.primary(item)}</div>
                      {s.sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{s.sub(item)}</div>}
                    </div>
                    <button
                      style={{ ...st.btnGhost, color: C.green, borderColor: `${C.green}55`, padding: "6px 12px", fontSize: 12.5, opacity: busy ? 0.7 : 1, flexShrink: 0,
                        ...(isMobile ? { width: "100%", justifyContent: "center" } : {}) }}
                      className="btn" disabled={!!busy} onClick={() => restore(s, item)}>
                      {busy === `${s.key}:${item.id}` ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />} Восстановить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>);
}
