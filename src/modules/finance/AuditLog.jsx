import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, ShieldCheck, Download } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fetchAuditLog } from "../../lib/api";

// ---------------------------------------------------------------- AUDIT LOG
// Журнал аудита (таблица audit_log): кто/что/когда менял. Данные пишут триггеры
// БД; чтение — только финадмины (RLS). Источник прозрачности для владельца.

const ACTION_META = {
  insert: { label: "Создание", tone: "success" },
  update: { label: "Изменение", tone: "info" },
  delete: { label: "Удаление", tone: "danger" },
};

// Человекочитаемые имена таблиц (без техжаргона в UI).
const TABLE_RU = {
  incomes: "Доход",
  fp_register: "Реестр",
  fp_periods: "Период ФП",
  directives: "Директива",
  payment_requests: "Заявка",
  supplier_bills: "Счёт поставщика",
  client_invoices: "Счёт клиента",
  funds: "Фонд",
  cash_accounts: "Счёт ДС",
  distribution_rules: "Правило распределения",
  statistics: "Статистика",
  statistic_values: "Значение статистики",
  profiles: "Сотрудник",
  org_positions: "Пост оргсхемы",
  counterparties: "Контрагент",
};
const tableRu = (t) => TABLE_RU[t] || t;

export function AuditLog() {
  const { C, st, isMobile, profile } = useTheme();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setErr("");
    try { setRows(await fetchAuditLog()); }
    catch (e) { setErr("Не удалось загрузить журнал: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isFinAdmin) load(); else setLoading(false); }, [isFinAdmin, load]);

  const counts = useMemo(() => {
    const c = { insert: 0, update: 0, delete: 0 };
    for (const r of rows) if (c[r.action] != null) c[r.action]++;
    return c;
  }, [rows]);

  const exportCsv = () => {
    const head = ["Дата", "Действие", "Объект", "ID записи", "Кто"];
    const lines = rows.map((r) => [
      new Date(r.created_at).toLocaleString("ru"),
      ACTION_META[r.action]?.label || r.action,
      tableRu(r.table_name),
      r.record_id || "", r.author?.full_name || "",
    ]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "Журнал_аудита.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!isFinAdmin) return <div style={{ ...st.locCard, ...st.empty }}><ShieldCheck size={18} /> Журнал аудита доступен владельцу и финдиректору</div>;
  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Журнал аудита · кто что менял</div>
            <div style={st.heroTitle}>История изменений</div>
          </div>
          <button style={st.btnGhost} className="btn" onClick={exportCsv} disabled={!rows.length}>
            <Download size={15} /> {!isMobile && "Экспорт CSV"}
          </button>
        </div>
        <div style={st.heroStats}>
          <Stat label="Записей" value={String(rows.length)} unit={rows.length === 200 ? "последние 200" : ""} />
          <Stat label="Создано" value={String(counts.insert)} tone="success" />
          <Stat label="Изменено" value={String(counts.update)} tone="info" />
          <Stat label="Удалено" value={String(counts.delete)} tone={counts.delete ? "danger" : undefined} />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    {!rows.length && !err && <div style={{ ...st.locCard, ...st.empty }}><ShieldCheck size={18} /> Записей в журнале пока нет</div>}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }} className="stagger">
      {rows.map((r) => {
        const m = ACTION_META[r.action] || { label: r.action, tone: "sub" };
        const tone = C[m.tone] || C.sub;
        return (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 12, background: C.solid2, border: `1px solid ${C.line}`,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }} className="frow">
            <span style={{ fontSize: 11, color: C.faint, width: 92, flexShrink: 0 }}>
              {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: tone, background: `${tone}1a`, flexShrink: 0 }}>
              {m.label}
            </span>
            <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0, fontSize: 12.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", order: isMobile ? 5 : 0 }}>
              {tableRu(r.table_name)}
            </div>
            {r.author && <span style={{ fontSize: 11, color: C.faint, flexShrink: 0, marginLeft: "auto" }}>{r.author.full_name}</span>}
          </div>
        );
      })}
    </div>
  </>);
}
