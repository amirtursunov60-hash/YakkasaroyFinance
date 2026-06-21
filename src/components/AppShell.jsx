import { useState, useMemo, useRef, useEffect } from "react";
import { X, Menu, User2, Settings, LogOut, Volume2, VolumeX, List } from "lucide-react";
import { ThemeSwitcher } from "./ui/apple-liquid-glass-switcher";
import "./ui/switcher.css";
import { Stub } from "./common";
import { MODULES, MODULE_NAV } from "../data/navigation";
import { avatarColor } from "../utils/format";
import { CrmModule } from "../modules/crm/CrmModule";
import { DashModule } from "../modules/dashboard/DashModule";
import { OwnerDashboard } from "../modules/dashboard/OwnerDashboard";
import { Clients } from "../modules/finance/Clients";
import { Control } from "../modules/finance/Control";
import { Directive } from "../modules/finance/Directive";
import { Expenses } from "../modules/finance/Expenses";
import { Funds } from "../modules/finance/Funds";
import { Income } from "../modules/finance/Income";
import { Payroll } from "../modules/finance/Payroll";
import { Register } from "../modules/finance/Register";
import { Reports } from "../modules/finance/Reports";
import { Requests } from "../modules/finance/Requests";
import { Suppliers } from "../modules/finance/Suppliers";
import { Obligations } from "../modules/finance/Obligations";
import { OrgModule } from "../modules/org/OrgModule";
import { MenuModule } from "../modules/menu/MenuModule";
import { RestOrders } from "../modules/restaurant/RestOrders";
import { RestStock } from "../modules/restaurant/RestStock";
import { RestTables } from "../modules/restaurant/RestTables";
import { StaffModule } from "../modules/staff/StaffModule";
import { StatsModule } from "../modules/stats/StatsModule";
import { makeCss } from "../theme/css";
import { useTheme } from "../theme/theme";
import { PeriodProvider, WeekPicker, LocationPicker } from "../lib/PeriodCtx";
import { GlobalSearch, NotifyBell } from "./TopWidgets";


export function App({ onLogout }) {
  const { C, st, theme, setTheme, lang, setLang, sound, setSound, isMobile, profile } = useTheme();
  const ROLE_LABELS = {
    owner: "Владелец",
    fin_director: "Финансовый директор",
    ops_director: "Операционный директор",
    location_manager: "Управляющий точкой",
    accountant: "Бухгалтер",
    employee: "Сотрудник",
  };
  const userName = profile?.full_name || "Пользователь";
  const userRole = ROLE_LABELS[profile?.role] || "—";
  const userEmail = profile?.email || "";
  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const css = useMemo(() => makeCss(C), [C]);
  const [activeModule, setActiveModule] = useState("finance");
  const [active, setActive] = useState("directive");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navList = MODULE_NAV[activeModule] || [];
  // На телефоне плавно прокручиваем ленту разделов так, чтобы активный был по центру
  const navBarRef = useRef(null);
  const activeNavRef = useRef(null);
  useEffect(() => {
    if (!isMobile) return;
    const center = () => {
      const nav = navBarRef.current, el = activeNavRef.current;
      if (!nav || !el) return;
      const target = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    };
    const r = requestAnimationFrame(center);
    const t = setTimeout(center, 220);  // повтор после загрузки шрифтов/раскладки
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, [active, activeModule, isMobile]);
  const pick = (key) => { setActive(key); setMenuOpen(false); };
  // Раздел по умолчанию при переходе в модуль: Финансы → Директива, Ресторан → Меню
  const DEFAULT_SECTION = { finance: "directive", restaurant: "r_menu" };
  const defaultSection = (key) => DEFAULT_SECTION[key] || MODULE_NAV[key][0].key;
  const pickModule = (key) => {
    if (!MODULE_NAV[key]) return;
    setActiveModule(key);
    const def = defaultSection(key);
    setActive(MODULE_NAV[key].some((n) => n.key === def) ? def : MODULE_NAV[key][0].key);
    setMenuOpen(false);
  };
  return (
    <PeriodProvider>
    <div style={st.app}>
      <style>{css}</style>

      <header className="appTop" style={{ ...st.topbar, ...(isMobile ? { gap: 8, padding: "0 10px" } : {}) }}>
        {isMobile && (
          <button style={st.burger} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        )}
        <div style={{ ...st.brand, ...(isMobile ? { gap: 7 } : {}) }}>
          <div style={{
            display: "grid", placeItems: "center", flexShrink: 0,
            width: 40, height: 40, borderRadius: "50%",
            background: "#0f1c15",
            border: `1px solid ${C.green}3a`,
            boxShadow: `0 4px 14px ${C.green}40, inset 0 1px 0 rgba(255,255,255,0.35)`,
          }}>
            <img src="/icons/logo-mark.png" alt="Яккасарой"
              style={{ width: "84%", height: "84%", objectFit: "contain" }} />
          </div>
        </div>
        <WeekPicker />
        <LocationPicker />
        {(() => {
          const regActive = activeModule === "finance" && active === "register";
          return (
            <button className="btn" title="Реестр операций"
              onClick={() => { setActiveModule("finance"); setActive("register"); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
                height: 38, padding: isMobile ? "0 9px" : "0 12px", borderRadius: 10,
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                color: regActive ? C.green : C.text,
                border: `1px solid ${regActive ? C.green + "66" : C.line}`,
                background: regActive ? `${C.green}1a` : C.panel2,
              }}>
              <List size={18} />
              {!isMobile && <span>Реестр</span>}
            </button>
          );
        })()}
        {!isMobile && <GlobalSearch onGo={(m, sec) => { setActiveModule(m); setActive(sec); }} />}
        <div style={{ ...st.topRight, ...(isMobile ? { gap: 6, marginLeft: "auto", flexShrink: 0 } : {}) }}>
          <NotifyBell onGo={(m, sec) => { setActiveModule(m); setActive(sec); }} />
          {!isMobile && <div style={st.user}><div style={st.uName}>{userName}</div><div style={st.uRole}>{userRole}</div></div>}
          <div style={st.profileWrap}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={userName} className="ava" onClick={() => setProfileOpen((o) => !o)} style={{ ...st.avatar, background: "none", objectFit: "cover", cursor: "pointer" }} />
              : <div style={{ ...st.avatar, background: `${avatarColor(userName)}26`, color: avatarColor(userName) }} className="ava" onClick={() => setProfileOpen((o) => !o)}>{initials}</div>}
            {profileOpen && (
              <>
                <div style={st.profileOverlay} onClick={() => setProfileOpen(false)} />
                <div style={st.profileMenu}>
                  <div style={st.pmHead}>
                    <div>
                      <div style={st.pmName}>{userName}</div>
                      <div style={st.pmMail}>{userEmail}</div>
                    </div>
                    <div style={st.pmLang} className="ava" onClick={() => setLang(lang === "ru" ? "tj" : "ru")} title="Сменить язык">
                      {lang === "ru" ? "RU" : "ТҶ"}
                    </div>
                  </div>
                  {/* Тема: liquid-glass свитчер (light / dark / dim) — стекло 1:1 из оригинала */}
                  <div className="tw-scope switcher-app" style={{ display: "flex", justifyContent: "center", padding: "6px 0 10px" }}>
                    <ThemeSwitcher value={theme} onValueChange={setTheme} />
                  </div>
                  <div style={st.themeToggle}>
                    <button style={{ ...st.themeBtn, ...(sound ? st.themeBtnOn : {}) }} onClick={() => setSound(true)}><Volume2 size={14} /> Звук вкл</button>
                    <button style={{ ...st.themeBtn, ...(!sound ? st.themeBtnOn : {}) }} onClick={() => setSound(false)}><VolumeX size={14} /> Выкл</button>
                  </div>
                  <div style={st.pmDivider} />
                  <div style={st.pmItem} className="pmi"><User2 size={16} color={C.sub} /> Профиль</div>
                  <div style={st.pmItem} className="pmi"><Settings size={16} color={C.sub} /> Настройки</div>
                  <div style={st.pmDivider} />
                  <div style={{ ...st.pmItem, color: C.danger }} className="pmi" onClick={onLogout}>
                    <LogOut size={16} color={C.danger} /> Выйти
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <nav ref={navBarRef} style={st.modBar}>
        {navList.map((n) => { const Icon = n.icon; const on = active === n.key; return (
          <div key={n.key} ref={on ? activeNavRef : null} style={{ ...st.mod, ...(on ? st.modActive : {}) }} className="mod" onClick={() => pick(n.key)}>
            <Icon size={17} strokeWidth={2} color={on ? C.green : C.sub} /><span>{n.label}</span>
          </div>); })}
      </nav>

      <div style={st.body}>
        {isMobile && menuOpen && <div style={st.overlay} onClick={() => setMenuOpen(false)} />}
        <aside style={{
          ...st.sidebar,
          ...(isMobile ? st.sidebarMobile : {}),
          ...(isMobile && menuOpen ? st.sidebarMobileOpen : {}),
        }}>
          {isMobile && (
            <div style={st.drawerHead}>
              <span style={st.drawerTitle}>Модули</span>
              <button style={st.iconBtn} onClick={() => setMenuOpen(false)}><X size={18} /></button>
            </div>
          )}
          <div style={st.sidebarLabel}>Модули</div>
          {MODULES.map((m) => { const Icon = m.icon; const on = activeModule === m.key; const clickable = !!MODULE_NAV[m.key]; return (
            <div key={m.key} style={{ ...st.nav, ...(on ? st.navActive : {}), opacity: clickable ? 1 : 0.45, cursor: clickable ? "pointer" : "default" }} className="nav" onClick={() => pickModule(m.key)}>
              <Icon size={19} strokeWidth={2} color={on ? "#fff" : C.sub} /><span>{m.label}</span>
            </div>); })}
        </aside>

        <main style={{ ...st.main, ...(isMobile ? { padding: (activeModule === "restaurant" && active === "r_menu") ? "1px" : "16px 8px 40px" } : {}) }}>
          {activeModule === "finance" && active === "control" && <Control />}
          {activeModule === "finance" && active === "directive" && <Directive />}
          {activeModule === "finance" && active === "income" && <Income />}
          {activeModule === "finance" && active === "expense" && <Expenses />}
          {activeModule === "finance" && active === "requests" && <Requests />}
          {activeModule === "finance" && active === "register" && <Register />}
          {activeModule === "finance" && active === "funds" && <Funds />}
          {activeModule === "finance" && active === "suppliers" && <Suppliers />}
          {activeModule === "finance" && active === "obligations" && <Obligations />}
          {activeModule === "finance" && active === "clients" && <Clients />}
          {activeModule === "finance" && active === "reports" && <Reports />}
          {activeModule === "finance" && active === "payroll" && <Payroll />}
          {activeModule === "finance" && !["directive", "income", "control", "expense", "requests", "register", "funds", "suppliers", "obligations", "clients", "reports", "payroll"].includes(active) && <Stub label={navList.find((n) => n.key === active)?.label} />}

          {activeModule === "staff" && <StaffModule view={active} />}

          {activeModule === "stats" && <StatsModule view={active} />}

          {activeModule === "orgchart" && <OrgModule view={active} />}

          {activeModule === "dashboard" && active === "d_owner" && <OwnerDashboard />}
          {activeModule === "dashboard" && active !== "d_owner" && <DashModule view={active} />}

          {activeModule === "crm" && <CrmModule view={active} />}

          {activeModule === "restaurant" && active === "r_orders" && <RestOrders />}
          {activeModule === "restaurant" && active === "r_tables" && <RestTables />}
          {activeModule === "restaurant" && active === "r_menu" && <MenuModule />}
          {activeModule === "restaurant" && active === "r_stock" && <RestStock />}
          {activeModule === "restaurant" && active === "r_shifts" && <Stub label="Смены" />}
        </main>
      </div>
    </div>
    </PeriodProvider>
  );
}
