import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Mail, Plus, Loader2, AlertCircle, CheckCircle2, X, ChevronRight,
  MessageCircle, Copy, Archive, Send, Users,
} from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { usePeriod } from "../../lib/PeriodCtx";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchMassmailCampaigns, fetchMassmailRecipients, createMassmailCampaign,
  markMassmailRecipientsSent, archiveMassmailCampaign, fetchCrmClients, fetchCrmLeads,
} from "../../lib/api";

// ---------------------------------------------------------------- MASSMAIL
// Рассылки клиентам (gap-map CRM §12). SMS/email-шлюза нет — формируем снимок
// получателей (имя+телефон) с WhatsApp-ссылками и копируемым списком + история.
const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const applyTemplate = (tpl, name) => String(tpl || "").replace(/\{name\}/g, name || "");
const waLink = (phone, text) => `https://wa.me/${onlyDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export function MassmailModule() {
  const { C, st, isMobile, profile } = useTheme();
  const { locationId } = usePeriod();
  const canEdit = ["owner", "fin_director", "ops_director", "location_manager", "accountant"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [campaigns, setCampaigns] = useState([]);
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [busy, setBusy] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);     // campaign id
  const [recips, setRecips] = useState({});           // { campaignId: [...] }

  const load = useCallback(async () => {
    setErr("");
    try {
      const [camps, cl, ld] = await Promise.all([fetchMassmailCampaigns(), fetchCrmClients(), fetchCrmLeads()]);
      setCampaigns(camps); setClients(cl); setLeads(ld);
    } catch (e) { setErr("Не удалось загрузить рассылки: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRecipients = async (camp) => {
    if (expanded === camp.id) { setExpanded(null); return; }
    setExpanded(camp.id);
    if (!recips[camp.id]) {
      try { setRecips((m) => ({ ...m, [camp.id]: null })); const r = await fetchMassmailRecipients(camp.id); setRecips((m) => ({ ...m, [camp.id]: r })); }
      catch (e) { setErr(e?.message || String(e)); }
    }
  };

  const doMarkAll = async (camp) => {
    setBusy(`sent:${camp.id}`); setErr(""); setDone("");
    try { await markMassmailRecipientsSent(camp.id); const r = await fetchMassmailRecipients(camp.id); setRecips((m) => ({ ...m, [camp.id]: r })); setDone("Отмечено как отправлено"); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doArchive = async (camp) => {
    if (!window.confirm(`Архивировать рассылку «${camp.title}»?`)) return;
    setBusy(`arch:${camp.id}`); setErr(""); setDone("");
    try { await archiveMassmailCampaign(camp.id); await load(); setDone("Рассылка в архиве"); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const copyList = async (camp) => {
    const list = (recips[camp.id] || []).filter((r) => r.recipient_phone).map((r) => `${r.recipient_name}: ${r.recipient_phone}`).join("\n");
    try { await navigator.clipboard.writeText(list); setDone("Список скопирован"); }
    catch { setErr("Не удалось скопировать — выделите вручную"); }
  };

  const sums = useMemo(() => ({ total: campaigns.length, recipients: campaigns.reduce((a, c) => a + (c.recipientCount || 0), 0) }), [campaigns]);

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Рассылки клиентам</div>
            <div style={st.heroTitle}>Кампаний: {sums.total}</div>
          </div>
          {canEdit && (
            <button style={st.btnGreen} className="btn" onClick={() => setShowForm(true)}>
              <Plus size={15} /> {isMobile ? "Рассылка" : "Новая рассылка"}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="Кампаний" value={String(sums.total)} unit="" />
          <Stat label="Получателей всего" value={String(sums.recipients)} unit="" accent />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 12 }}>
      Шлюза SMS/почты нет: рассылка формирует список получателей с телефонами — отправляйте через WhatsApp (кнопка у каждого) или скопируйте список. Отмечайте отправленных вручную.
    </div>

    {!campaigns.length && <div style={{ ...st.locCard, ...st.empty }}>Рассылок пока нет{canEdit ? " — создайте первую" : ""}</div>}

    <div style={{ display: "grid", gap: 12 }}>
      {campaigns.map((camp) => {
        const open = expanded === camp.id;
        const list = recips[camp.id];
        const sentN = (list || []).filter((r) => r.is_sent).length;
        return (
          <div key={camp.id} style={st.locCard}>
            <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead" onClick={() => openRecipients(camp)}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${C.green}22`, color: C.green }}><Mail size={17} /></div>
              <div style={st.locTitle}>
                <div style={st.locName}>{camp.title}</div>
                <div style={st.locCode}>
                  {camp.segment_type === "clients" ? "База клиентов" : "Лиды воронки"} · {camp.recipientCount} получ.
                  {camp.created_at ? ` · ${new Date(camp.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}` : ""}
                </div>
              </div>
              <span style={{ ...st.locChevron, transform: open ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>

            {open && (
              <div style={st.locBody}>
                <div style={{ padding: "10px 16px" }}>
                  {camp.template_text && (
                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 10, padding: "8px 12px", background: `${C.faint}1a`, borderRadius: 8, whiteSpace: "pre-wrap" }}>{camp.template_text}</div>
                  )}
                  {list === undefined || list === null ? (
                    <div style={{ ...st.empty, padding: "12px 0" }}><Loader2 size={14} className="spin" /> Загрузка получателей…</div>
                  ) : !list.length ? (
                    <div style={{ ...st.empty, padding: "12px 0" }}>Получателей нет (нет телефонов в сегменте)</div>
                  ) : (<>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: C.sub }}>Отправлено: <b style={{ color: C.green }}>{sentN}</b> из {list.length}</span>
                      <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12, marginLeft: "auto" }} className="btn" onClick={() => copyList(camp)}>
                        <Copy size={13} /> Копировать список
                      </button>
                      {canEdit && sentN < list.length && (
                        <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12, color: C.green }} className="btn" disabled={busy === `sent:${camp.id}`} onClick={() => doMarkAll(camp)}>
                          {busy === `sent:${camp.id}` ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Отметить все отправленными
                        </button>
                      )}
                      {canEdit && (
                        <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12, color: C.danger }} className="btn" disabled={busy === `arch:${camp.id}`} onClick={() => doArchive(camp)}>
                          {busy === `arch:${camp.id}` ? <Loader2 size={13} className="spin" /> : <Archive size={13} />} В архив
                        </button>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {list.map((r) => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, opacity: r.is_sent ? 0.6 : 1 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.recipient_name}</div>
                            <div style={{ fontSize: 11.5, color: C.faint }}>{r.recipient_phone}{r.note ? ` · ${r.note}` : ""}{r.is_sent ? " · отправлено" : ""}</div>
                          </div>
                          <a href={waLink(r.recipient_phone, applyTemplate(camp.template_text, r.recipient_name))} target="_blank" rel="noopener noreferrer"
                            style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12, color: C.green, textDecoration: "none", flexShrink: 0 }} className="btn">
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        </div>
                      ))}
                    </div>
                  </>)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>

    {showForm && (
      <MassmailForm C={C} st={st} isMobile={isMobile} clients={clients} leads={leads} locationId={locationId}
        onClose={() => setShowForm(false)}
        onSaved={(msg) => { setShowForm(false); load(); setDone(msg); }} />
    )}
  </>);
}


// ---------------------------------------------------------------- Форма новой рассылки
function MassmailForm({ C, st, isMobile, clients, leads, locationId, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("Здравствуйте, {name}! ");
  const [segType, setSegType] = useState("clients");
  const [tag, setTag] = useState("");
  const [eventType, setEventType] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Уникальные значения для фильтров (из реальных данных)
  const tags = useMemo(() => [...new Set(clients.map((c) => c.tag).filter(Boolean))], [clients]);
  const eventTypes = useMemo(() => [...new Set(leads.map((l) => l.event_type).filter(Boolean))], [leads]);
  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean))], [leads]);

  // Снимок получателей по выбранному сегменту (телефон обязателен, дедуп по номеру)
  const recipients = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (name, phone, sourceType, sourceId, note) => {
      const key = onlyDigits(phone);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ name: name || "Без имени", phone, sourceType, sourceId, note });
    };
    if (segType === "clients") {
      clients.filter((c) => (!locationId || c.location_id === locationId) && (!tag || c.tag === tag))
        .forEach((c) => push(c.name, c.phone, "client", c.id, c.tag || null));
    } else {
      leads.filter((l) => (!locationId || l.location_id === locationId) && (!eventType || l.event_type === eventType) && (!source || l.source === source))
        .forEach((l) => push(l.name, l.phone, "lead", l.id, [l.event_type, l.event_date].filter(Boolean).join(" ")));
    }
    return out;
  }, [segType, clients, leads, tag, eventType, source, locationId]);

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!title.trim()) return setErr("Укажите название рассылки");
    if (!recipients.length) return setErr("В сегменте нет получателей с телефоном");
    setBusy(true);
    try {
      await createMassmailCampaign(
        { title: title.trim(), templateText: text.trim() || null, segmentType: segType,
          segmentFilters: { tag: tag || null, event_type: eventType || null, source: source || null }, locationId: locationId || null },
        recipients);
      onSaved(`Рассылка создана · получателей: ${recipients.length}`);
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на создание рассылки по этой точке." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Новая рассылка</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Скидка к юбилеям, приглашение…" autoFocus />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Текст сообщения (макрос {"{name}"} — имя получателя)</span>
            <textarea style={{ ...st.mdInput, minHeight: 90, resize: "vertical", lineHeight: 1.4 }} value={text}
              onChange={(e) => setText(e.target.value)} placeholder="Здравствуйте, {name}! Приглашаем…" />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Кому</span>
            <select style={st.mdSelect} className="fin" value={segType} onChange={(e) => setSegType(e.target.value)}>
              <option value="clients">База клиентов</option>
              <option value="leads">Лиды воронки</option>
            </select>
          </div>
          {segType === "clients" ? (
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Метка (необязательно)</span>
              <select style={st.mdSelect} className="fin" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">— все клиенты —</option>
                {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
              <div style={st.reqField}>
                <span style={st.reqFieldLbl}>Тип события</span>
                <select style={st.mdSelect} className="fin" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  <option value="">— любой —</option>
                  {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={st.reqField}>
                <span style={st.reqFieldLbl}>Источник</span>
                <select style={st.mdSelect} className="fin" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">— любой —</option>
                  {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.sub, padding: "8px 12px", background: `${C.green}12`, borderRadius: 8 }}>
            <Users size={15} color={C.green} /> Получателей с телефоном: <b style={{ color: C.text }}>{recipients.length}</b>
            {locationId && <span style={{ color: C.faint }}>· только выбранная точка</span>}
          </div>
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginTop: 10 }}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Создать
          </button>
        </div>
      </div>
    </div>
  );
}
