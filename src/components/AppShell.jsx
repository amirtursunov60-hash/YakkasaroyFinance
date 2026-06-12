import { useState, useMemo } from "react";
import { Layers, Bell, Search, X, Menu, User2, Settings, LogOut, Sun, Moon } from "lucide-react";
import { Stub } from "./common";
import { MODULES, MODULE_NAV } from "../data/navigation";
import { CrmModule } from "../modules/crm/CrmModule";
import { DashModule } from "../modules/dashboard/DashModule";
import { Clients } from "../modules/finance/Clients";
import { Control } from "../modules/finance/Control";
import { Directive } from "../modules/finance/Directive";
import { Expenses } from "../modules/finance/Expenses";
import { Funds } from "../modules/finance/Funds";
import { Income } from "../modules/finance/Income";
import { Payroll } from "../modules/finance/Payroll";
import { Reports } from "../modules/finance/Reports";
import { Suppliers } from "../modules/finance/Suppliers";
import { OrgModule } from "../modules/org/OrgModule";
import { RestMenu } from "../modules/restaurant/RestMenu";
import { RestOrders } from "../modules/restaurant/RestOrders";
import { RestStock } from "../modules/restaurant/RestStock";
import { RestTables } from "../modules/restaurant/RestTables";
import { StaffModule } from "../modules/staff/StaffModule";
import { StatsModule } from "../modules/stats/StatsModule";
import { makeCss } from "../theme/css";
import { useTheme } from "../theme/theme";
import { PeriodProvider, WeekPicker } from "../lib/PeriodCtx";


export function App({ onLogout }) {
  const { C, st, theme, setTheme, lang, setLang, isMobile, profile } = useTheme();
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
  const pick = (key) => { setActive(key); setMenuOpen(false); };
  const pickModule = (key) => {
    if (!MODULE_NAV[key]) return;
    setActiveModule(key);
    setActive(MODULE_NAV[key][0].key);
    setMenuOpen(false);
  };
  return (
    <PeriodProvider>
    <div style={st.app}>
      <style>{css}</style>

      <header style={st.topbar}>
        {isMobile && (
          <button style={st.burger} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        )}
        <div style={st.brand}>
          <div style={st.logo}><Layers size={18} strokeWidth={2.4} /></div>
          <div style={st.brandTxt}>Яккасарой{!isMobile && <span style={st.brandThin}> финанс</span>}</div>
        </div>
        <WeekPicker />
        {!isMobile && <div style={st.searchWrap}><Search size={16} color={C.faint} /><input style={st.search} placeholder="Поиск…" /></div>}
        <div style={st.topRight}>
          <button style={st.iconBtn}><Bell size={17} /></button>
          {!isMobile && <div style={st.user}><div style={st.uName}>{userName}</div><div style={st.uRole}>{userRole}</div></div>}
          <div style={st.profileWrap}>
            <div style={st.avatar} className="ava" onClick={() => setProfileOpen((o) => !o)}>{initials}</div>
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
                  <div style={st.themeToggle}>
                    <button style={{ ...st.themeBtn, ...(theme === "light" ? st.themeBtnOn : {}) }} onClick={() => setTheme("light")}><Sun size={14} /> Light</button>
                    <button style={{ ...st.themeBtn, ...(theme === "dark" ? st.themeBtnOn : {}) }} onClick={() => setTheme("dark")}><Moon size={14} /> Dark</button>
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

      <nav style={st.modBar}>
        {navList.map((n) => { const Icon = n.icon; const on = active === n.key; return (
          <div key={n.key} style={{ ...st.mod, ...(on ? st.modActive : {}) }} className="mod" onClick={() => pick(n.key)}>
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

        <main style={st.main}>
          {activeModule === "finance" && active === "control" && <Control />}
          {activeModule === "finance" && active === "directive" && <Directive />}
          {activeModule === "finance" && active === "income" && <Income />}
          {activeModule === "finance" && active === "expense" && <Expenses />}
          {activeModule === "finance" && active === "funds" && <Funds />}
          {activeModule === "finance" && active === "suppliers" && <Suppliers />}
          {activeModule === "finance" && active === "clients" && <Clients />}
          {activeModule === "finance" && active === "reports" && <Reports />}
          {activeModule === "finance" && active === "payroll" && <Payroll />}
          {activeModule === "finance" && !["directive", "income", "control", "expense", "funds", "suppliers", "clients", "reports", "payroll"].includes(active) && <Stub label={navList.find((n) => n.key === active)?.label} />}

          {activeModule === "staff" && <StaffModule view={active} />}

          {activeModule === "stats" && <StatsModule view={active} />}

          {activeModule === "orgchart" && <OrgModule view={active} />}

          {activeModule === "dashboard" && <DashModule view={active} />}

          {activeModule === "crm" && <CrmModule view={active} />}

          {activeModule === "restaurant" && active === "r_orders" && <RestOrders />}
          {activeModule === "restaurant" && active === "r_tables" && <RestTables />}
          {activeModule === "restaurant" && active === "r_menu" && <RestMenu />}
          {activeModule === "restaurant" && active === "r_stock" && <RestStock />}
          {activeModule === "restaurant" && active === "r_shifts" && <Stub label="Смены" />}
        </main>
      </div>
    </div>
    </PeriodProvider>
  );
}
