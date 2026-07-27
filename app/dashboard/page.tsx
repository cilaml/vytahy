"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
type FaultPriority = "bezna" | "dulezita" | "odstavka" | "uvizle_osoby";
type FaultStatus =
  | "nova"
  | "prirazeno"
  | "na_ceste"
  | "rozpracovano"
  | "ceka_na_dil"
  | "ceka_na_spravce"
  | "ceka_na_pristup"
  | "ceka_na_zakaznika"
  | "hotovo"
  | "archivovano";
type ActionType = "servis" | "porucha" | "montaz" | "oprava" | "op" | "oz" | "ip" | "jine";
type ActionStatus = "planovano" | "potvrzeno" | "na_ceste" | "rozpracovano" | "hotovo" | "zruseno";
type ToolStatus = "sklad" | "vydano" | "oprava" | "vyrazeno";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  can_do_inspections: boolean;
};

type Elevator = {
  id: string;
  label: string;
  address: string;
  last_op_date: string | null;
  op_interval_months: number;
  last_oz_date: string | null;
  oz_interval_months: number;
  last_ip_date: string | null;
  ip_interval_years: number;
};

type Fault = {
  id: string;
  elevator_id: string;
  priority: FaultPriority;
  status: FaultStatus;
  description: string;
  main_technician_id: string | null;
  created_at: string;
};

type PlannedAction = {
  id: string;
  title: string;
  action_type: ActionType;
  status: ActionStatus;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  address: string;
  elevator_id: string | null;
};

type PlannedActionAssignee = {
  planned_action_id: string;
  profile_id: string;
  is_lead: boolean;
};

type Tool = {
  id: string;
  status: ToolStatus;
};

type IconName =
  | "calendar"
  | "wrench"
  | "alert"
  | "users"
  | "clipboard"
  | "search"
  | "bell"
  | "help"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "pin"
  | "more";

const openFaultStatuses: FaultStatus[] = [
  "nova",
  "prirazeno",
  "na_ceste",
  "rozpracovano",
  "ceka_na_dil",
  "ceka_na_spravce",
  "ceka_na_pristup",
  "ceka_na_zakaznika",
];

const actionLabels: Record<ActionType, string> = {
  servis: "Servisní zásah",
  porucha: "Porucha",
  montaz: "Montáž",
  oprava: "Oprava",
  op: "Odborná prohlídka",
  oz: "Odborná zkouška",
  ip: "Inspekční prohlídka",
  jine: "Plánovaná akce",
};

const actionColors: Record<ActionType, string> = {
  servis: "#3478f6",
  porucha: "#e64a4a",
  montaz: "#8a5cf5",
  oprava: "#f29c38",
  op: "#12a85b",
  oz: "#00a2a8",
  ip: "#7d8793",
  jine: "#7d8793",
};

const monthNames = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

const weekdayShort = ["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function addYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [actions, setActions] = useState<PlannedAction[]>([]);
  const [assignees, setAssignees] = useState<PlannedActionAssignee[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      window.location.href = "/login";
      return;
    }

    const [profileResult, profilesResult, elevatorsResult, faultsResult, actionsResult, assigneesResult, toolsResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,full_name,role,active,can_do_inspections")
          .eq("id", authData.user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id,email,full_name,role,active,can_do_inspections")
          .eq("active", true)
          .order("full_name", { ascending: true }),
        supabase
          .from("elevators")
          .select("id,label,address,last_op_date,op_interval_months,last_oz_date,oz_interval_months,last_ip_date,ip_interval_years")
          .order("address", { ascending: true }),
        supabase
          .from("faults")
          .select("id,elevator_id,priority,status,description,main_technician_id,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("planned_actions")
          .select("id,title,action_type,status,starts_at,ends_at,all_day,address,elevator_id")
          .neq("status", "zruseno")
          .order("starts_at", { ascending: true }),
        supabase
          .from("planned_action_assignees")
          .select("planned_action_id,profile_id,is_lead"),
        supabase.from("tools").select("id,status"),
      ]);

    const firstError =
      profileResult.error ||
      profilesResult.error ||
      elevatorsResult.error ||
      faultsResult.error ||
      actionsResult.error ||
      assigneesResult.error ||
      toolsResult.error;

    if (firstError) {
      setError(`Dashboard se nepodařilo načíst: ${firstError.message}`);
      setLoading(false);
      return;
    }

    if (!profileResult.data) {
      setError("Profil přihlášeného uživatele nebyl nalezen.");
      setLoading(false);
      return;
    }

    setProfile(profileResult.data as Profile);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setFaults((faultsResult.data ?? []) as Fault[]);
    setActions((actionsResult.data ?? []) as PlannedAction[]);
    setAssignees((assigneesResult.data ?? []) as PlannedActionAssignee[]);
    setTools((toolsResult.data ?? []) as Tool[]);
    setLoading(false);
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);

  const openFaults = useMemo(
    () => faults.filter((fault) => openFaultStatuses.includes(fault.status)),
    [faults]
  );

  const todayActions = useMemo(
    () => actions.filter((action) => {
      const start = new Date(action.starts_at);
      return start >= todayStart && start < todayEnd;
    }),
    [actions, todayStart.getTime(), todayEnd.getTime()]
  );

  const weekActions = useMemo(
    () => actions.filter((action) => {
      const start = new Date(action.starts_at);
      return start >= weekStart && start < weekEnd;
    }),
    [actions, weekStart.getTime(), weekEnd.getTime()]
  );

  const assignedTodayIds = useMemo(() => {
    const todayActionIds = new Set(todayActions.map((action) => action.id));
    return new Set(
      assignees
        .filter((item) => todayActionIds.has(item.planned_action_id))
        .map((item) => item.profile_id)
    );
  }, [todayActions, assignees]);

  const inspectionsThisWeek = useMemo(() => {
    let count = 0;

    for (const elevator of elevators) {
      const opDate = parseDate(elevator.last_op_date);
      const ozDate = parseDate(elevator.last_oz_date);
      const ipDate = parseDate(elevator.last_ip_date);
      const nextDates = [
        opDate ? addMonths(opDate, elevator.op_interval_months) : null,
        ozDate ? addMonths(ozDate, elevator.oz_interval_months) : null,
        ipDate ? addYears(ipDate, elevator.ip_interval_years) : null,
      ];

      for (const nextDate of nextDates) {
        if (nextDate && nextDate >= weekStart && nextDate < weekEnd) count += 1;
      }
    }

    return count;
  }, [elevators, weekStart.getTime(), weekEnd.getTime()]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const firstDay = first.getDay() || 7;
    const gridStart = addDays(first, -(firstDay - 1));
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [calendarMonth]);

  const actionsByDay = useMemo(() => {
    const map = new Map<string, PlannedAction[]>();
    for (const action of actions) {
      const key = dateKey(new Date(action.starts_at));
      const list = map.get(key) ?? [];
      list.push(action);
      map.set(key, list);
    }
    return map;
  }, [actions]);

  const selectedActions = useMemo(
    () => [...(actionsByDay.get(dateKey(selectedDate)) ?? [])].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    ),
    [actionsByDay, selectedDate]
  );

  const availableTools = tools.filter((tool) => tool.status === "sklad").length;
  const toolsOnJobs = tools.filter((tool) => tool.status === "vydano").length;
  const toolsNeedAttention = tools.filter((tool) => tool.status === "oprava").length;

  function getElevator(action: PlannedAction) {
    return elevators.find((elevator) => elevator.id === action.elevator_id) ?? null;
  }

  function getActionAssignees(actionId: string) {
    const profileIds = assignees
      .filter((item) => item.planned_action_id === actionId)
      .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
      .map((item) => item.profile_id);

    return profileIds
      .map((id) => profiles.find((item) => item.id === id)?.full_name)
      .filter((value): value is string => Boolean(value));
  }

  function technicianStatus(technician: Profile) {
    const assigned = todayActions.find((action) =>
      assignees.some(
        (item) => item.planned_action_id === action.id && item.profile_id === technician.id
      )
    );

    if (!assigned) return { label: "V kanceláři", tone: "office" };
    if (assigned.status === "na_ceste") return { label: "Na cestě", tone: "travel" };
    return { label: "V terénu", tone: "field" };
  }

  function goToToday() {
    const today = startOfDay(new Date());
    setCalendarMonth(today);
    setSelectedDate(today);
  }

  if (loading) {
    return (
      <main className="dashboard-shell">
        <div className="vd-loading">Načítám přehled…</div>
        <DashboardStyles />
      </main>
    );
  }

  const greetingName = profile?.full_name?.split(" ")[0] || "uživateli";
  const fullToday = capitalise(
    now.toLocaleDateString("cs-CZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

  return (
    <main className="dashboard-shell">
      <DashboardStyles />

      <header className="vd-topbar">
        <div className="vd-greeting">
          <h1>Dobrý den, {greetingName}</h1>
          <p>{fullToday}</p>
        </div>

        <div className="vd-topbar-actions">
          <label className="vd-search">
            <Icon name="search" size={18} />
            <input aria-label="Hledat" placeholder="Hledat…" />
            <span>Ctrl + K</span>
          </label>
          <button className="vd-icon-button vd-notification" aria-label="Upozornění">
            <Icon name="bell" size={19} />
            {openFaults.length > 0 && <b>{Math.min(openFaults.length, 9)}</b>}
          </button>
          <button className="vd-icon-button" aria-label="Nápověda">
            <Icon name="help" size={19} />
          </button>
          <div className="vd-avatar" title={profile?.full_name ?? "Uživatel"}>
            {initials(profile?.full_name ?? "U")}
            <span />
          </div>
        </div>
      </header>

      <div className="vd-page">
        {error && <div className="vd-error">{error}</div>}

        <section className="vd-stats">
          <SummaryCard icon="calendar" tone="green" title="Dnes" value={todayActions.length} subtitle="naplánované akce" />
          <SummaryCard icon="wrench" tone="blue" title="Tento týden" value={weekActions.length} subtitle="naplánovaných akcí" />
          <SummaryCard icon="alert" tone="red" title="Poruchy" value={openFaults.length} subtitle="otevřené" />
          <SummaryCard icon="users" tone="purple" title="Technici" value={assignedTodayIds.size} subtitle="v terénu" />
          <SummaryCard icon="clipboard" tone="amber" title="Prohlídky" value={inspectionsThisWeek} subtitle="v tomto týdnu" />
        </section>

        <section className="vd-dashboard-grid">
          <section className="vd-panel vd-calendar-panel">
            <div className="vd-panel-header vd-calendar-header">
              <div>
                <h2>Kalendář</h2>
                <div className="vd-month-controls">
                  <button onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} aria-label="Předchozí měsíc">
                    <Icon name="chevron-left" size={18} />
                  </button>
                  <button className="vd-today-button" onClick={goToToday}>Dnes</button>
                  <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} aria-label="Další měsíc">
                    <Icon name="chevron-right" size={18} />
                  </button>
                  <strong>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</strong>
                </div>
              </div>

              <div className="vd-calendar-actions">
                <div className="vd-view-switch">
                  <button className="active">Měsíc</button>
                  <button>Týden</button>
                  <button>Den</button>
                </div>
                <a className="vd-primary-button" href="/planned-actions">
                  <Icon name="plus" size={17} /> Nová akce
                </a>
              </div>
            </div>

            <div className="vd-calendar">
              {weekdayShort.map((day) => <div className="vd-weekday" key={day}>{day}</div>)}
              {calendarDays.map((day) => {
                const dayActions = actionsByDay.get(dateKey(day)) ?? [];
                const outside = day.getMonth() !== calendarMonth.getMonth();
                const selected = sameDay(day, selectedDate);
                const today = sameDay(day, now);

                return (
                  <button
                    type="button"
                    className={`vd-day ${outside ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""}`}
                    key={dateKey(day)}
                    onClick={() => setSelectedDate(startOfDay(day))}
                  >
                    <span className="vd-day-number">{day.getDate()}</span>
                    <span className="vd-day-dots">
                      {dayActions.slice(0, 4).map((action) => (
                        <i key={action.id} style={{ background: actionColors[action.action_type] }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="vd-agenda">
              <div className="vd-agenda-title">
                <h3>{capitalise(selectedDate.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</h3>
                <span>{selectedActions.length} {selectedActions.length === 1 ? "akce" : "akcí"}</span>
              </div>

              {selectedActions.length === 0 ? (
                <div className="vd-empty">Pro tento den nejsou naplánované žádné akce.</div>
              ) : (
                <div className="vd-agenda-list">
                  {selectedActions.map((action) => {
                    const elevator = getElevator(action);
                    const names = getActionAssignees(action.id);
                    const navigationAddress = action.address || elevator?.address || "";
                    return (
                      <article className="vd-agenda-row" key={action.id}>
                        <i className="vd-agenda-dot" style={{ background: actionColors[action.action_type] }} />
                        <div className="vd-agenda-time">
                          {action.all_day ? "Celý den" : `${formatTime(action.starts_at)} – ${formatTime(action.ends_at)}`}
                        </div>
                        <div className="vd-agenda-main">
                          <strong>{action.title || actionLabels[action.action_type]}</strong>
                          <span>{navigationAddress || "Bez uvedené adresy"}</span>
                        </div>
                        <div className="vd-agenda-people">
                          <Icon name="users" size={16} />
                          <span>{names.length > 0 ? names.join(", ") : "Nepřiřazeno"}</span>
                        </div>
                        <div className="vd-agenda-elevator">{elevator?.label ?? "—"}</div>
                        {navigationAddress ? (
                          <a
                            className="vd-navigate"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationAddress)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="pin" size={16} /> Navigovat
                          </a>
                        ) : <span />}
                        <button className="vd-more" aria-label="Další možnosti"><Icon name="more" size={18} /></button>
                      </article>
                    );
                  })}
                </div>
              )}

              <a className="vd-show-all" href="/planned-actions">Zobrazit všechny akce dne</a>
            </div>
          </section>

          <aside className="vd-right-column">
            <section className="vd-panel vd-side-panel">
              <div className="vd-panel-header">
                <h2>Dnešní technici</h2>
                <a href="/technicians">Všichni</a>
              </div>
              <div className="vd-technicians">
                {profiles.slice(0, 5).map((technician) => {
                  const status = technicianStatus(technician);
                  return (
                    <div className="vd-technician" key={technician.id}>
                      <div className="vd-technician-avatar">{initials(technician.full_name)}</div>
                      <div>
                        <strong>{technician.full_name}</strong>
                        <span>{technician.role === "technik" ? "Technik" : "Servis"}</span>
                      </div>
                      <b className={`vd-status ${status.tone}`}>{status.label}</b>
                    </div>
                  );
                })}
              </div>
              <a className="vd-secondary-button" href="/technicians">Zobrazit všechny</a>
            </section>

            <section className="vd-panel vd-side-panel">
              <div className="vd-panel-header"><h2>Rychlé akce</h2></div>
              <div className="vd-quick-actions">
                <QuickAction href="/faults" icon="alert" tone="red" label="Nová porucha" />
                <QuickAction href="/service" icon="wrench" tone="blue" label="Nový servisní zásah" />
                <QuickAction href="/inspections" icon="clipboard" tone="green" label="Odborná prohlídka / zkouška" />
                <QuickAction href="/planned-actions" icon="calendar" tone="purple" label="Plánovaná akce" />
              </div>
            </section>

            <section className="vd-panel vd-side-panel">
              <div className="vd-panel-header"><h2>Nářadí – rychlý přehled</h2></div>
              <div className="vd-tools-overview">
                <ToolLine label="Právě na akcích" value={`${toolsOnJobs} ks`} />
                <ToolLine label="Dostupné" value={`${availableTools} ks`} />
                <ToolLine label="Potřebuje kontrolu" value={`${toolsNeedAttention} ks`} attention />
              </div>
              <a className="vd-secondary-button" href="/tools">Přejít na evidenci nářadí</a>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  tone,
  title,
  value,
  subtitle,
}: {
  icon: IconName;
  tone: "green" | "blue" | "red" | "purple" | "amber";
  title: string;
  value: number;
  subtitle: string;
}) {
  return (
    <article className="vd-summary-card">
      <span className={`vd-summary-icon ${tone}`}><Icon name={icon} size={20} /></span>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{subtitle}</small>
      </div>
    </article>
  );
}

function QuickAction({ href, icon, tone, label }: { href: string; icon: IconName; tone: string; label: string }) {
  return (
    <a href={href}>
      <span className={`vd-quick-icon ${tone}`}><Icon name={icon} size={18} /></span>
      <strong>{label}</strong>
      <Icon name="chevron-right" size={17} />
    </a>
  );
}

function ToolLine({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={attention ? "attention" : ""}>{value}</strong>
    </div>
  );
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L19 15.4a2.1 2.1 0 0 1-3 3l-6.7-6.7" /></>,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 11l2 2 4-4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4M12 18h.01" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function DashboardStyles() {
  return (
    <style>{`
      .dashboard-shell { min-height: 100vh; background: #f4f7f9; color: #142433; }
      .vd-loading { min-height: 100vh; display: grid; place-items: center; color: #637488; font-weight: 700; }
      .vd-topbar { min-height: 92px; padding: 20px 30px; background: rgba(255,255,255,.96); border-bottom: 1px solid #e1e8ed; display: flex; align-items: center; justify-content: space-between; gap: 22px; position: sticky; top: 0; z-index: 30; backdrop-filter: blur(14px); }
      .vd-greeting h1 { margin: 0; color: #102a43; font-size: 25px; line-height: 1.2; font-weight: 850; letter-spacing: -0.025em; }
      .vd-greeting p { margin: 5px 0 0; color: #7b8999; font-size: 13px; }
      .vd-topbar-actions { display: flex; align-items: center; gap: 10px; }
      .vd-search { min-width: 300px; height: 42px; display: flex; align-items: center; gap: 9px; padding: 0 10px 0 13px; border: 1px solid #dfe7ec; border-radius: 12px; background: #f8fafb; color: #8795a5; }
      .vd-search input { min-width: 0; flex: 1; border: 0; outline: 0 !important; background: transparent; color: #1b2d3d; }
      .vd-search span { padding: 4px 7px; border: 1px solid #d9e2e8; border-radius: 6px; background: white; font-size: 10px; color: #8a98a8; }
      .vd-icon-button { width: 42px; height: 42px; display: grid; place-items: center; position: relative; border: 1px solid #dfe7ec; border-radius: 12px; background: white; color: #536779; cursor: pointer; }
      .vd-notification b { position: absolute; right: -4px; top: -5px; width: 18px; height: 18px; display: grid; place-items: center; border: 2px solid white; border-radius: 999px; background: #079447; color: white; font-size: 9px; }
      .vd-avatar { width: 43px; height: 43px; display: grid; place-items: center; position: relative; border-radius: 999px; background: #082a49; color: white; font-weight: 850; font-size: 13px; }
      .vd-avatar span { position: absolute; right: 1px; bottom: 1px; width: 10px; height: 10px; border: 2px solid white; border-radius: 999px; background: #20bd69; }
      .vd-page { padding: 26px 30px 38px; }
      .vd-error { margin-bottom: 18px; padding: 13px 15px; border: 1px solid #f3c4c4; border-radius: 12px; background: #fff2f2; color: #a42b2b; }
      .vd-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
      .vd-summary-card { min-height: 106px; display: flex; align-items: center; gap: 13px; padding: 16px; border: 1px solid #e0e7ec; border-radius: 15px; background: white; box-shadow: 0 6px 18px rgba(26, 53, 73, .055); }
      .vd-summary-icon { width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; }
      .vd-summary-icon.green { background: #e7f7ed; color: #079447; }
      .vd-summary-icon.blue { background: #eaf1ff; color: #3478f6; }
      .vd-summary-icon.red { background: #fdeaea; color: #e34d4d; }
      .vd-summary-icon.purple { background: #f0ebff; color: #8058e8; }
      .vd-summary-icon.amber { background: #fff3df; color: #e4932c; }
      .vd-summary-card > div { display: grid; grid-template-columns: auto 1fr; align-items: end; column-gap: 8px; }
      .vd-summary-card span { grid-column: 1 / -1; color: #647487; font-size: 12px; font-weight: 750; }
      .vd-summary-card strong { color: #12283b; font-size: 28px; line-height: 1; font-weight: 900; }
      .vd-summary-card small { color: #8a98a7; font-size: 11px; padding-bottom: 2px; }
      .vd-dashboard-grid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 18px; align-items: start; }
      .vd-panel { border: 1px solid #e0e7ec; border-radius: 17px; background: white; box-shadow: 0 8px 24px rgba(26, 53, 73, .055); }
      .vd-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .vd-panel-header h2 { margin: 0; color: #13293b; font-size: 17px; font-weight: 850; }
      .vd-panel-header > a { color: #079447; text-decoration: none; font-size: 12px; font-weight: 750; }
      .vd-calendar-panel { overflow: hidden; }
      .vd-calendar-header { padding: 18px 20px 16px; border-bottom: 1px solid #e4eaee; }
      .vd-month-controls { display: flex; align-items: center; gap: 6px; margin-top: 11px; }
      .vd-month-controls button { height: 30px; min-width: 30px; display: grid; place-items: center; border: 1px solid #dfe7ec; border-radius: 8px; background: white; color: #607386; cursor: pointer; }
      .vd-month-controls .vd-today-button { padding: 0 10px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 750; }
      .vd-month-controls strong { margin-left: 8px; color: #1a3042; font-size: 14px; }
      .vd-calendar-actions { display: flex; align-items: center; gap: 10px; }
      .vd-view-switch { display: flex; padding: 3px; border: 1px solid #dfe7ec; border-radius: 9px; background: #f8fafb; }
      .vd-view-switch button { padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; color: #718194; font-size: 11px; cursor: pointer; }
      .vd-view-switch button.active { background: #e7f6ed; color: #067c3d; font-weight: 800; }
      .vd-primary-button, .vd-secondary-button, .vd-navigate { text-decoration: none; }
      .vd-primary-button { height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border-radius: 9px; background: #082a49; color: white; font-size: 12px; font-weight: 800; }
      .vd-calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
      .vd-weekday { padding: 9px 10px; border-bottom: 1px solid #e6ecef; color: #8190a0; font-size: 10px; font-weight: 850; text-align: center; }
      .vd-day { min-height: 76px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; border: 0; border-right: 1px solid #edf1f3; border-bottom: 1px solid #edf1f3; background: white; color: #415568; cursor: pointer; }
      .vd-day:nth-child(7n) { border-right: 0; }
      .vd-day:hover { background: #f8fbf9; }
      .vd-day.outside { color: #b4bdc6; background: #fbfcfd; }
      .vd-day.selected { position: relative; background: #f4fbf7; box-shadow: inset 0 0 0 2px #9ad7b5; }
      .vd-day-number { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 999px; font-size: 12px; font-weight: 750; }
      .vd-day.today .vd-day-number { background: #082a49; color: white; }
      .vd-day-dots { min-height: 7px; display: flex; align-items: center; justify-content: center; gap: 4px; }
      .vd-day-dots i { width: 6px; height: 6px; border-radius: 999px; }
      .vd-agenda { padding: 18px 20px 20px; }
      .vd-agenda-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
      .vd-agenda-title h3 { margin: 0; color: #1a3042; font-size: 14px; font-weight: 850; }
      .vd-agenda-title span { color: #8a98a7; font-size: 11px; }
      .vd-agenda-list { display: grid; gap: 8px; }
      .vd-agenda-row { min-height: 66px; display: grid; grid-template-columns: 8px 92px minmax(170px, 1fr) minmax(120px, .7fr) 54px auto 28px; align-items: center; gap: 11px; padding: 10px 11px; border: 1px solid #e5ebef; border-radius: 11px; background: #fff; }
      .vd-agenda-dot { width: 7px; height: 7px; border-radius: 999px; }
      .vd-agenda-time { color: #51677a; font-size: 11px; font-weight: 750; }
      .vd-agenda-main { min-width: 0; display: grid; gap: 3px; }
      .vd-agenda-main strong { overflow: hidden; color: #172d3f; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .vd-agenda-main span, .vd-agenda-people, .vd-agenda-elevator { color: #7a8a9a; font-size: 10px; }
      .vd-agenda-people { min-width: 0; display: flex; align-items: center; gap: 5px; }
      .vd-agenda-people span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vd-agenda-elevator { font-weight: 750; text-align: center; }
      .vd-navigate { height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 9px; border: 1px solid #dce6e1; border-radius: 8px; color: #087c3e; background: #f6fbf8; font-size: 10px; font-weight: 800; }
      .vd-more { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #8594a3; cursor: pointer; }
      .vd-empty { padding: 18px; border: 1px dashed #d8e1e6; border-radius: 11px; color: #8391a0; background: #fafcfd; font-size: 12px; }
      .vd-show-all { display: inline-flex; margin-top: 12px; color: #078644; text-decoration: none; font-size: 11px; font-weight: 800; }
      .vd-right-column { display: grid; gap: 18px; }
      .vd-side-panel { padding: 17px; }
      .vd-technicians { display: grid; gap: 5px; margin: 13px 0; }
      .vd-technician { min-height: 48px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 7px 5px; border-bottom: 1px solid #edf1f3; }
      .vd-technician:last-child { border-bottom: 0; }
      .vd-technician-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: #edf4f8; color: #24475e; font-size: 10px; font-weight: 850; }
      .vd-technician > div:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
      .vd-technician strong { overflow: hidden; color: #1a3042; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .vd-technician span { color: #8b99a7; font-size: 9px; }
      .vd-status { padding: 5px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; white-space: nowrap; }
      .vd-status.field { background: #e6f7ed; color: #087b3e; }
      .vd-status.travel { background: #fff1d9; color: #9a651e; }
      .vd-status.office { background: #eef2f5; color: #718090; }
      .vd-secondary-button { min-height: 36px; display: flex; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid #dce5ea; border-radius: 9px; background: #fafcfd; color: #335269; font-size: 11px; font-weight: 800; }
      .vd-quick-actions { display: grid; margin-top: 9px; }
      .vd-quick-actions a { min-height: 46px; display: grid; grid-template-columns: 32px 1fr 18px; align-items: center; gap: 9px; border-bottom: 1px solid #edf1f3; color: #243a4c; text-decoration: none; }
      .vd-quick-actions a:last-child { border-bottom: 0; }
      .vd-quick-actions strong { font-size: 11px; }
      .vd-quick-actions a > svg { color: #9aa6b2; }
      .vd-quick-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; }
      .vd-quick-icon.red { background: #fdeaea; color: #dc4b4b; }
      .vd-quick-icon.blue { background: #eaf1ff; color: #3478f6; }
      .vd-quick-icon.green { background: #e7f7ed; color: #079447; }
      .vd-quick-icon.purple { background: #f0ebff; color: #8058e8; }
      .vd-tools-overview { display: grid; gap: 0; margin: 10px 0 13px; }
      .vd-tools-overview > div { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #edf1f3; }
      .vd-tools-overview > div:last-child { border-bottom: 0; }
      .vd-tools-overview span { color: #708194; font-size: 11px; }
      .vd-tools-overview strong { color: #183045; font-size: 12px; }
      .vd-tools-overview strong.attention { color: #d98223; }
      @media (max-width: 1250px) { .vd-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } .vd-dashboard-grid { grid-template-columns: 1fr; } .vd-right-column { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 900px) { .vd-topbar { padding: 14px 16px; } .vd-page { padding: 16px; } .vd-search { display: none; } .vd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .vd-right-column { grid-template-columns: 1fr; } .vd-calendar-header { align-items: flex-start; } .vd-calendar-actions { align-items: flex-end; flex-direction: column; } .vd-view-switch { display: none; } .vd-agenda-row { grid-template-columns: 8px 78px minmax(0, 1fr) auto; } .vd-agenda-people, .vd-agenda-elevator, .vd-more { display: none; } }
      @media (max-width: 600px) { .vd-greeting h1 { font-size: 20px; } .vd-topbar-actions { gap: 6px; } .vd-icon-button { width: 38px; height: 38px; } .vd-avatar { width: 39px; height: 39px; } .vd-stats { grid-template-columns: 1fr; } .vd-summary-card { min-height: 84px; } .vd-calendar-header { display: grid; } .vd-calendar-actions { align-items: stretch; } .vd-primary-button { justify-content: center; } .vd-day { min-height: 58px; padding: 5px; } .vd-day-number { width: 22px; height: 22px; font-size: 10px; } .vd-agenda-row { grid-template-columns: 7px 66px minmax(0, 1fr); } .vd-navigate { display: none; } }
    `}</style>
  );
}
