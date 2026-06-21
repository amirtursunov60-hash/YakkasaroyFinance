import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, UserPlus, Loader2, AlertCircle, CheckCircle2, X, Plus, Copy, Trash2, ChevronRight, MapPin, Network, Camera } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { avatarColor } from "../../utils/format";
import { MjPanel, MjSwitch } from "../manajet/MjPanel";
import {
  fetchEmployees, updateProfile, fetchAllPositions, assignPosition, unassignPosition,
  setLocationAccess, fetchIncomeRefs, uploadAvatar,
  fetchInvites, createInvite, deleteInvite,
} from "../../lib/api";


// ---------------------------------------------------------------- STAFF
// Живые данные (ТЗ v2 §3): список сотрудников с ролями, постами и доступом
// к точкам; приглашения по ссылке (invites). Роль и доступы меняет владелец
// или финдиректор (RLS), посты — также операционный директор.

const ROLE_LABELS = {
  owner: "Владелец",
  fin_director: "Финансовый директор",
  ops_director: "Операционный директор",
  location_manager: "Управляющий точкой",
  accountant: "Бухгалтер",
  employee: "Сотрудник",
};
const ROLE_OPTIONS = Object.entries(ROLE_LABELS);

export function StaffModule({ view }) {
  const { C, st, isMobile, profile } = useTheme();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canInvite = isFinAdmin || profile?.role === "ops_director";

  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState("ours");   // наши данные / зеркало ManaJet
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [people, setPeople] = useState([]);
  const [positions, setPositions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setErr("");
    try {
      const [ppl, poss, refs, invs] = await Promise.all([
        fetchEmployees(), fetchAllPositions(), fetchIncomeRefs(),
        canInvite ? fetchInvites() : Promise.resolve([]),
      ]);
      setPeople(ppl); setPositions(poss); setLocations(refs.locations); setInvites(invs);
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [canInvite]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, okMsg) => {
    if (busy) return;
    setBusy(key); setErr(""); setDone("");
    try {
      await fn();
      await load();
      if (okMsg) setDone(okMsg);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (view !== "st_invites" && src === "manajet") return <MjPanel kind="persons" src={src} setSrc={setSrc} />;
  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const banner = (<>
    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  if (view === "st_invites") {
    return (<>
      {banner}
      <InvitesView C={C} st={st} isMobile={isMobile} profile={profile} canInvite={canInvite}
        invites={invites} positions={positions} locations={locations} busy={busy} act={act} />
    </>);
  }

  return (<>
    <MjSwitch src={src} setSrc={setSrc} />
    {banner}
    <PeopleView C={C} st={st} isMobile={isMobile} isFinAdmin={isFinAdmin} profile={profile}
      people={people} positions={positions} locations={locations}
      busy={busy} act={act} expanded={expanded} setExpanded={setExpanded} />
  </>);
}


// ---------------------------------------------------------------- Сотрудники
function PeopleView({ C, st, isMobile, isFinAdmin, profile, people, positions, locations, busy, act, expanded, setExpanded }) {
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l.name])), [locations]);

  return (<>
    <section style={st.reqSectionHead}>
      <Users size={18} color={C.green} />
      <h3 style={st.reqSectionTitle}>Сотрудники</h3>
      <span style={st.reqSectionSub}>{people.length} чел. · роли, посты, доступ к точкам</span>
    </section>

    {people.map((p) => {
      const isExp = !!expanded[p.id];
      const initials = (p.full_name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      const posList = (p.assignments || []).map((a) => a.position).filter(Boolean);
      const accessIds = new Set((p.location_access || []).map((a) => a.location_id));
      return (
        <div key={p.id} style={{ ...st.locCard, marginBottom: 10, opacity: p.is_active ? 1 : 0.55 }}>
          <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
            onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.full_name} style={{ ...st.avatar, background: "none", objectFit: "cover" }} />
                : <div style={{ ...st.avatar, background: `${avatarColor(p.full_name)}26`, color: avatarColor(p.full_name) }}>{initials}</div>}
              {(profile?.id === p.id || isFinAdmin) && (
                <label className="btn" title="Сменить аватар" onClick={(e) => e.stopPropagation()}
                  style={{ position: "absolute", right: -2, bottom: -2, width: 19, height: 19, borderRadius: "50%", background: C.green, color: C.onAccent, display: "grid", placeItems: "center", cursor: busy ? "default" : "pointer", border: `2px solid ${C.panel}` }}>
                  {busy === `avatar:${p.id}` ? <Loader2 size={10} className="spin" /> : <Camera size={11} />}
                  <input type="file" accept="image/*" hidden disabled={!!busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) act(`avatar:${p.id}`, () => uploadAvatar(p.id, f), "Аватар обновлён"); e.target.value = ""; }} />
                </label>
              )}
            </div>
            <div style={st.locTitle}>
              <div style={st.locName}>{p.full_name}{!p.is_active && " · деактивирован"}</div>
              <div style={st.locCode}>
                {ROLE_LABELS[p.role] || p.role}
                {p.phone ? ` · ${p.phone}` : ""}
                {posList.length ? ` · ${posList.map((x) => x.code).join(", ")}` : ""}
              </div>
            </div>
            <span style={{ ...st.weekTag, marginLeft: "auto" }}>{ROLE_LABELS[p.role] || p.role}</span>
            <span style={{ ...st.locChevron, transform: isExp ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
          </div>

          {isExp && (
            <div style={st.locBody}>
              <div style={{ display: "grid", gap: 14, padding: "6px 2px 10px" }}>
                {/* Роль и активность */}
                {isFinAdmin && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <select style={{ ...st.mdSelect, width: "auto", minWidth: 200 }} className="fin" value={p.role} disabled={!!busy}
                      onChange={(e) => act(`role:${p.id}`, () => updateProfile(p.id, { role: e.target.value }), `Роль обновлена: ${ROLE_LABELS[e.target.value]}`)}>
                      {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button style={{ ...st.btnGhost, color: p.is_active ? C.danger : C.green }} className="btn" disabled={!!busy}
                      onClick={() => act(`active:${p.id}`, () => updateProfile(p.id, { is_active: !p.is_active }),
                        p.is_active ? "Сотрудник деактивирован" : "Сотрудник активирован")}>
                      {p.is_active ? "Деактивировать" : "Активировать"}
                    </button>
                  </div>
                )}

                {/* Посты */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                    <Network size={12} /> Посты оргсхемы
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {posList.map((pos) => (
                      <span key={pos.id} style={{ ...st.weekTag, marginLeft: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {pos.code} {pos.name}
                        {isFinAdmin && (
                          <X size={12} style={{ cursor: "pointer" }}
                            onClick={() => act(`unpos:${p.id}`, () => unassignPosition(p.id, pos.id), "Пост снят")} />
                        )}
                      </span>
                    ))}
                    {!posList.length && <span style={{ fontSize: 12.5, color: C.faint }}>постов нет</span>}
                    {isFinAdmin && (
                      <select style={{ ...st.mdSelect, width: "auto", fontSize: 12.5, padding: "5px 9px" }} className="fin" value="" disabled={!!busy}
                        onChange={(e) => e.target.value && act(`pos:${p.id}`, () => assignPosition(p.id, e.target.value), "Пост назначен")}>
                        <option value="">+ назначить пост</option>
                        {positions.filter((x) => !posList.some((y) => y.id === x.id)).map((x) => (
                          <option key={x.id} value={x.id}>{x.code} · {x.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Доступ к точкам */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={12} /> Доступ к точкам
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {locations.map((l) => {
                      const on = accessIds.has(l.id);
                      return (
                        <button key={l.id} className="btn" disabled={!isFinAdmin || !!busy}
                          style={{
                            ...st.weekTag, marginLeft: 0, border: "none", fontFamily: "inherit",
                            cursor: isFinAdmin ? "pointer" : "default", padding: "5px 12px",
                            color: on ? C.onAccent : C.sub, background: on ? C.green : `${C.sub}1a`,
                          }}
                          onClick={() => isFinAdmin && act(`loc:${p.id}:${l.id}`,
                            () => setLocationAccess(p.id, l.id, !on),
                            !on ? `Доступ к «${l.name}» выдан` : `Доступ к «${l.name}» снят`)}>
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
                    Владелец, финдиректор и операционный директор видят все точки без явной выдачи.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })}
  </>);
}


// ---------------------------------------------------------------- Приглашения
function InvitesView({ C, st, isMobile, profile, canInvite, invites, positions, locations, busy, act }) {
  const [f, setF] = useState({ role: "employee", locationId: "", positionId: "" });
  const [copied, setCopied] = useState(null);

  const linkOf = (token) =>
    `${window.location.origin}${window.location.pathname}?invite=${token}`;

  const copy = async (inv) => {
    try {
      await navigator.clipboard.writeText(linkOf(inv.token));
      setCopied(inv.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Скопируйте ссылку:", linkOf(inv.token));
    }
  };

  const status = (inv) => {
    if (inv.used_at) return { label: `использовано · ${inv.used_profile?.full_name || ""}`, color: C.green };
    if (new Date(inv.expires_at) < new Date()) return { label: "истекло", color: C.danger };
    return { label: `до ${new Date(inv.expires_at).toLocaleDateString("ru")}`, color: C.warning };
  };

  if (!canInvite) {
    return <div style={{ ...st.locCard, ...st.empty }}>Приглашения доступны владельцу, финансовому и операционному директорам.</div>;
  }

  return (<>
    <section style={st.reqSectionHead}>
      <UserPlus size={18} color={C.green} />
      <h3 style={st.reqSectionTitle}>Приглашения</h3>
      <span style={st.reqSectionSub}>ссылка действует 7 дней, одноразовая</span>
    </section>

    {/* Создание */}
    <div style={{ ...st.locCard, marginBottom: 14, padding: 16 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr auto", alignItems: "end" }}>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Роль</span>
          <select style={st.mdSelect} className="fin" value={f.role} onChange={(e) => setF((p) => ({ ...p, role: e.target.value }))}>
            {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Точка (доступ)</span>
          <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Пост</span>
          <select style={st.mdSelect} className="fin" value={f.positionId} onChange={(e) => setF((p) => ({ ...p, positionId: e.target.value }))}>
            <option value="">—</option>
            {positions.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
          </select>
        </div>
        <button style={{ ...st.btnGreen, whiteSpace: "nowrap" }} className="btn" disabled={!!busy}
          onClick={() => act("invite", () => createInvite({
            role: f.role, locationId: f.locationId, positionId: f.positionId, createdBy: profile.id,
          }), "Приглашение создано — скопируйте ссылку и отправьте сотруднику")}>
          {busy === "invite" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Создать
        </button>
      </div>
    </div>

    {/* Список */}
    {!invites.length && <div style={{ ...st.locCard, ...st.empty }}>Приглашений пока нет</div>}
    {invites.map((inv) => {
      const s = status(inv);
      return (
        <div key={inv.id} style={{ ...st.locCard, marginBottom: 8 }}>
          <div style={st.locHead}>
            <div style={{ ...st.locDot, background: s.color }} />
            <div style={st.locTitle}>
              <div style={st.locName}>{ROLE_LABELS[inv.role] || inv.role}</div>
              <div style={st.locCode}>
                {inv.location?.name || "без точки"}
                {inv.position ? ` · ${inv.position.code} ${inv.position.name}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
              <span style={{ ...st.weekTag, marginLeft: 0, color: s.color, background: `${s.color}1a` }}>{s.label}</span>
              {!inv.used_at && (
                <button style={{ ...st.btnGhost, padding: "6px 10px" }} className="btn" onClick={() => copy(inv)}>
                  {copied === inv.id ? <CheckCircle2 size={14} color={C.green} /> : <Copy size={14} />}
                  {!isMobile && (copied === inv.id ? " Скопировано" : " Ссылка")}
                </button>
              )}
              <button style={{ ...st.iconBtn, color: C.danger }} className="btn" disabled={!!busy}
                onClick={() => window.confirm("Удалить приглашение? Ссылка перестанет работать.") &&
                  act(`del:${inv.id}`, () => deleteInvite(inv.id), "Приглашение удалено")}>
                {busy === `del:${inv.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>
        </div>
      );
    })}
  </>);
}
