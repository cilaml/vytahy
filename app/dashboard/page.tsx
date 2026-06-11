"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type ProfileRegion = {
  id: string;
  profile_id: string;
  region_id: string;
};

type Region = {
  id: string;
  name: string;
};

type Elevator = {
  id: string;
  label: string;
  address: string;
  region_id: string | null;
  serial_number: string | null;
  pr_number: string | null;
  pl_number: string | null;
  inspection_technician_id: string | null;
  last_op_date: string | null;
  op_interval_months: number;
  last_oz_date: string | null;
  oz_interval_months: number;
  last_ip_date: string | null;
  ip_interval_years: number;
};

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

type Fault = {
  id: string;
  elevator_id: string;
  region_id: string | null;
  priority: FaultPriority;
  status: FaultStatus;
  description: string;
  created_by: string | null;
  main_technician_id: string | null;
  created_at: string;
  finished_at: string | null;
  archived_at: string | null;
};

type FaultAssignee = {
  id: string;
  fault_id: string;
  profile_id: string;
  role: "hlavni" | "spolupracovnik";
};

type MessageTargetType = "all" | "role" | "profile" | "region";

type Message = {
  id: string;
  created_by: string | null;
  title: string;
  body: string;
  target_type: MessageTargetType;
  target_role: UserRole | null;
  target_profile_id: string | null;
  target_region_id: string | null;
  created_at: string;
};

type InspectionType = "op" | "oz" | "ip";

type InspectionRow = {
  elevator: Elevator;
  type: InspectionType;
  label: string;
  lastDate: string | null;
  nextDate: Date | null;
  status: "ok" | "soon" | "overdue" | "missing";
  intervalText: string;
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const priorityLabels: Record<FaultPriority, string> = {
  bezna: "Běžná",
  dulezita: "Důležitá",
  odstavka: "Odstávka",
  uvizle_osoby: "Uvízlé osoby",
};

const statusLabels: Record<FaultStatus, string> = {
  nova: "Nová",
  prirazeno: "Přiřazeno",
  na_ceste: "Na cestě",
  rozpracovano: "Rozpracováno",
  ceka_na_dil: "Čeká na díl",
  ceka_na_spravce: "Čeká na správce",
  ceka_na_pristup: "Čeká na přístup",
  ceka_na_zakaznika: "Čeká na zákazníka",
  hotovo: "Hotovo",
  archivovano: "Archivováno",
};

const activeFaultStatuses: FaultStatus[] = [
  "nova",
  "prirazeno",
  "na_ceste",
  "rozpracovano",
  "ceka_na_dil",
  "ceka_na_spravce",
  "ceka_na_pristup",
  "ceka_na_zakaznika",
];

const inspectionLabels: Record<InspectionType, string> = {
  op: "OP",
  oz: "OZ",
  ip: "IP",
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [faultAssignees, setFaultAssignees] = useState<FaultAssignee[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  const isAdminOrLead =
    profile?.role === "admin" || profile?.role === "vedouci_technik";

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, primary_region_id, can_do_inspections, active"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setMessage(`Chyba při načítání profilu: ${profileError.message}`);
      setLoading(false);
      return;
    }

    if (!profileData) {
      setMessage("Profil pro přihlášeného uživatele nebyl nalezen.");
      setLoading(false);
      return;
    }

    const [
      profilesResult,
      regionsResult,
      profileRegionsResult,
      elevatorsResult,
      faultsResult,
      assigneesResult,
      messagesResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .order("full_name", { ascending: true }),

      supabase.from("regions").select("id, name").order("name", { ascending: true }),

      supabase.from("profile_regions").select("id, profile_id, region_id"),

      supabase
        .from("elevators")
        .select(
          "id, label, address, region_id, serial_number, pr_number, pl_number, inspection_technician_id, last_op_date, op_interval_months, last_oz_date, oz_interval_months, last_ip_date, ip_interval_years"
        )
        .order("address", { ascending: true }),

      supabase
        .from("faults")
        .select(
          "id, elevator_id, region_id, priority, status, description, created_by, main_technician_id, created_at, finished_at, archived_at"
        )
        .order("created_at", { ascending: false }),

      supabase.from("fault_assignees").select("id, fault_id, profile_id, role"),

      supabase
        .from("messages")
        .select(
          "id, created_by, title, body, target_type, target_role, target_profile_id, target_region_id, created_at"
        )
        .order("created_at", { ascending: false }),
    ]);

    const error =
      profilesResult.error ||
      regionsResult.error ||
      profileRegionsResult.error ||
      elevatorsResult.error ||
      faultsResult.error ||
      assigneesResult.error ||
      messagesResult.error;

    if (error) {
      setMessage(`Chyba při načítání dashboardu: ${error.message}`);
      setLoading(false);
      return;
    }

    setProfile(profileData as Profile);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setRegions((regionsResult.data ?? []) as Region[]);
    setProfileRegions((profileRegionsResult.data ?? []) as ProfileRegion[]);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setFaults((faultsResult.data ?? []) as Fault[]);
    setFaultAssignees((assigneesResult.data ?? []) as FaultAssignee[]);
    setMessages((messagesResult.data ?? []) as Message[]);

    setLoading(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function enableNotifications() {
    setNotificationMessage("");

    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator)) {
      setNotificationMessage("Tenhle prohlížeč nepodporuje service worker.");
      return;
    }

    if (!("PushManager" in window)) {
      setNotificationMessage("Tenhle prohlížeč nepodporuje push upozornění.");
      return;
    }

    if (!("Notification" in window)) {
      setNotificationMessage("Tenhle prohlížeč nepodporuje oznámení.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setNotificationMessage("Chybí veřejný VAPID klíč v nastavení aplikace.");
      return;
    }

    setNotificationSaving(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setNotificationMessage("Upozornění nejsou povolená v prohlížeči.");
        setNotificationSaving(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const subscriptionJson = subscription.toJSON();

      if (
        !subscriptionJson.endpoint ||
        !subscriptionJson.keys?.p256dh ||
        !subscriptionJson.keys?.auth
      ) {
        setNotificationMessage(
          "Push subscription neobsahuje potřebné údaje. Zkus stránku obnovit a zapnout upozornění znovu."
        );
        setNotificationSaving(false);
        return;
      }

      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setNotificationMessage("Nejsi přihlášený.");
        setNotificationSaving(false);
        return;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscription: subscriptionJson,
          user_agent: navigator.userAgent,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        setNotificationMessage(
          `Upozornění se nepovedlo zapnout: ${responseText}`
        );
        setNotificationSaving(false);
        return;
      }

      setNotificationMessage("Upozornění jsou zapnutá.");
      setNotificationSaving(false);
    } catch (error) {
      setNotificationMessage(
        `Upozornění se nepovedlo zapnout: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setNotificationSaving(false);
    }
  }

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";
    return regions.find((region) => region.id === regionId)?.name ?? "Neznámý rajon";
  }

  function getProfileName(profileId: string | null) {
    if (!profileId) return "Nepřiřazen";
    return profiles.find((item) => item.id === profileId)?.full_name ?? "Neznámý technik";
  }

  function getElevator(elevatorId: string) {
    return elevators.find((item) => item.id === elevatorId) ?? null;
  }

  function getElevatorLabel(elevatorId: string) {
    const elevator = getElevator(elevatorId);
    if (!elevator) return "Neznámý výtah";
    return `${elevator.address} — ${elevator.label}`;
  }

  function getUserRegionIds() {
    if (!profile) return [];

    const secondary = profileRegions
      .filter((item) => item.profile_id === profile.id)
      .map((item) => item.region_id);

    return [profile.primary_region_id, ...secondary].filter(Boolean) as string[];
  }

  function isFaultAssignedToMe(fault: Fault) {
    if (!profile) return false;

    if (fault.main_technician_id === profile.id) return true;

    return faultAssignees.some(
      (item) =>
        item.fault_id === fault.id &&
        item.profile_id === profile.id &&
        item.role === "spolupracovnik"
    );
  }

  function isFaultVisibleForUser(fault: Fault) {
    if (!profile) return false;
    if (isAdminOrLead) return true;
    if (isFaultAssignedToMe(fault)) return true;

    const userRegionIds = getUserRegionIds();
    return fault.region_id ? userRegionIds.includes(fault.region_id) : false;
  }

  function isMessageRelevant(item: Message) {
    if (!profile) return false;
    if (isAdminOrLead) return true;

    if (item.target_type === "all") return true;

    if (item.target_type === "role") {
      return item.target_role === profile.role;
    }

    if (item.target_type === "profile") {
      return item.target_profile_id === profile.id;
    }

    if (item.target_type === "region") {
      if (!item.target_region_id) return false;
      return getUserRegionIds().includes(item.target_region_id);
    }

    return false;
  }

  function addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function addYears(date: Date, years: number) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  function parseDate(value: string | null) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDate(date: Date | null) {
    if (!date) return "—";
    return date.toLocaleDateString("cs-CZ");
  }

  function getInspectionStatus(nextDate: Date | null): InspectionRow["status"] {
    if (!nextDate) return "missing";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const soonLimit = new Date(today);
    soonLimit.setDate(soonLimit.getDate() + 30);

    if (nextDate < today) return "overdue";
    if (nextDate <= soonLimit) return "soon";
    return "ok";
  }

  function buildInspectionRows(elevator: Elevator): InspectionRow[] {
    const lastOp = parseDate(elevator.last_op_date);
    const nextOp = lastOp ? addMonths(lastOp, elevator.op_interval_months || 3) : null;

    const lastOz = parseDate(elevator.last_oz_date);
    const nextOz = lastOz ? addMonths(lastOz, elevator.oz_interval_months || 36) : null;

    const lastIp = parseDate(elevator.last_ip_date);
    const nextIp = lastIp ? addYears(lastIp, elevator.ip_interval_years || 6) : null;

    return [
      {
        elevator,
        type: "op",
        label: "OP",
        lastDate: elevator.last_op_date,
        nextDate: nextOp,
        status: getInspectionStatus(nextOp),
        intervalText: `${elevator.op_interval_months || 3} měs.`,
      },
      {
        elevator,
        type: "oz",
        label: "OZ",
        lastDate: elevator.last_oz_date,
        nextDate: nextOz,
        status: getInspectionStatus(nextOz),
        intervalText: `${elevator.oz_interval_months || 36} měs.`,
      },
      {
        elevator,
        type: "ip",
        label: "IP",
        lastDate: elevator.last_ip_date,
        nextDate: nextIp,
        status: getInspectionStatus(nextIp),
        intervalText: `${elevator.ip_interval_years || 6} let`,
      },
    ];
  }

  const activeFaults = useMemo(() => {
    return faults.filter((fault) => activeFaultStatuses.includes(fault.status));
  }, [faults]);

  const visibleActiveFaults = useMemo(() => {
    return activeFaults.filter((fault) => isFaultVisibleForUser(fault));
  }, [activeFaults, profile, faultAssignees, profileRegions]);

  const myWorkFaults = useMemo(() => {
    return activeFaults.filter((fault) => isFaultAssignedToMe(fault)).slice(0, 5);
  }, [activeFaults, profile, faultAssignees]);

  const trappedFaults = useMemo(() => {
    return visibleActiveFaults
      .filter((fault) => fault.priority === "uvizle_osoby")
      .slice(0, 4);
  }, [visibleActiveFaults]);

  const currentFaults = useMemo(() => {
    return visibleActiveFaults
      .filter((fault) => fault.priority !== "uvizle_osoby")
      .slice(0, 5);
  }, [visibleActiveFaults]);

  const messagesForMe = useMemo(() => {
    return messages.filter((item) => isMessageRelevant(item)).slice(0, 4);
  }, [messages, profile, profileRegions]);

  const visibleElevators = useMemo(() => {
    if (!profile) return [];

    if (isAdminOrLead) return elevators;

    const regionIds = getUserRegionIds();
    return elevators.filter((elevator) =>
      elevator.region_id ? regionIds.includes(elevator.region_id) : false
    );
  }, [elevators, profile, profileRegions]);

  const inspectionRows = useMemo(() => {
    if (!profile) return [];

    const allowedElevators =
      isAdminOrLead || profile.can_do_inspections
        ? visibleElevators.filter((elevator) => {
            if (isAdminOrLead) return true;
            if (elevator.inspection_technician_id === profile.id) return true;
            return true;
          })
        : [];

    return allowedElevators
      .flatMap((elevator) => buildInspectionRows(elevator))
      .filter((row) => row.status === "overdue" || row.status === "soon")
      .sort((a, b) => {
        const order: Record<InspectionRow["status"], number> = {
          overdue: 0,
          soon: 1,
          missing: 2,
          ok: 3,
        };

        const statusDiff = order[a.status] - order[b.status];
        if (statusDiff !== 0) return statusDiff;

        const aTime = a.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return aTime - bTime;
      })
      .slice(0, 5);
  }, [visibleElevators, profile, isAdminOrLead]);

  const faultsThisMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return faults.filter((fault) => {
      const created = new Date(fault.created_at);
      return created >= start && created < end;
    }).length;
  }, [faults]);

  const activeRegionsCount = regions.length;
  const activeTechniciansCount = profiles.filter((item) => item.active).length;

  if (loading) {
    return (
      <main className="page-shell">
        <p>Načítám dashboard...</p>
        <StyleBlock />
      </main>
    );
  }

  return (
    <main className="app-layout">
      <StyleBlock />

      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-kicker">SERVISNÍ SYSTÉM</div>
          <div className="brand-title">Výtahy Servis</div>
          <div className="brand-subtitle">Databáze, poruchy, servis a revize</div>
        </div>

        <div className="side-label">PŘIHLÁŠENÝ UŽIVATEL</div>

        <div className="user-select">
          {profile ? profile.full_name : "Nepřihlášen"} —{" "}
          {profile ? roleLabels[profile.role] : ""}
        </div>

        <nav className="nav">
          <NavLink active href="/dashboard" label="Hlavní stránka" />
          <NavLink href="/faults" label="Poruchy" />
          <NavLink href="/messages" label="Zprávy" />
          <NavLink href="/service" label="Servis" />
          <NavLink href="/elevators" label="Výtahy" />
          <NavLink href="/technicians" label="Technici" />
          <NavLink href="/inspections" label="Revize" />
          <NavLink href="/regions" label="Rajony" />
        </nav>

        {profile && (
          <div className="profile-card">
            <strong>{profile.full_name}</strong>
            <span>{roleLabels[profile.role]}</span>
            <span>
              Rajon:{" "}
              {profile.primary_region_id
                ? getRegionName(profile.primary_region_id)
                : "Bez rajonu"}
            </span>
            <span>Revize: {profile.can_do_inspections ? "Ano" : "Ne"}</span>
          </div>
        )}

        <a href="/faults" className="sidebar-fault-button">
          + Založit poruchu
        </a>

        <button
          type="button"
          onClick={enableNotifications}
          disabled={notificationSaving}
          className="sidebar-notification-button"
        >
          {notificationSaving ? "Zapínám upozornění..." : "Zapnout upozornění"}
        </button>

        {notificationMessage && (
          <div className="sidebar-notification-message">
            {notificationMessage}
          </div>
        )}

        <div className="sidebar-spacer" />

        <button onClick={handleLogout} className="logout-button">
          Odhlásit
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Hlavní stránka</h1>
            <p>Moje práce, urgentní poruchy, zprávy a blížící se revize.</p>
          </div>
        </header>

        {message && <div className="error-box">{message}</div>}

        <section className="grid-main">
          <Card className="my-work-card">
            <CardHeader
              title="Moje práce"
              subtitle="Hlavní technik i spolupracovník"
            />

            {myWorkFaults.length === 0 ? (
              <EmptyBox text="Nemáš přiřazenou žádnou aktivní poruchu." />
            ) : (
              <div className="list">
                {myWorkFaults.map((fault) => (
                  <FaultMiniCard key={fault.id} fault={fault} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Zprávy pro mě" subtitle="Poslední relevantní zprávy" />

            {messagesForMe.length === 0 ? (
              <EmptyBox text="Nemáš žádné nové zprávy." />
            ) : (
              <div className="list">
                {messagesForMe.map((item) => (
                  <a href="/messages" className="message-card" key={item.id}>
                    <div className="date-text">
                      {new Date(item.created_at).toLocaleDateString("cs-CZ")}
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </section>

        <Card className="urgent-card">
          <CardHeader title="Uvízlé osoby" subtitle="Vždy nahoře a výrazně červeně" />

          {trappedFaults.length === 0 ? (
            <EmptyBox text="Aktuálně nejsou hlášeny uvízlé osoby." />
          ) : (
            <div className="list">
              {trappedFaults.map((fault) => (
                <FaultMiniCard key={fault.id} fault={fault} urgent />
              ))}
            </div>
          )}
        </Card>

        <section className="grid-main">
          <Card>
            <CardHeader title="Aktuální poruchy" subtitle="Aktivní poruchy podle práv a rajonů" />

            {currentFaults.length === 0 ? (
              <EmptyBox text="Aktuálně tu nejsou žádné běžné aktivní poruchy." />
            ) : (
              <div className="list">
                {currentFaults.map((fault) => (
                  <FaultMiniCard key={fault.id} fault={fault} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Revize, zkoušky a IP" subtitle="Po termínu nebo do 30 dnů" />

            {inspectionRows.length === 0 ? (
              <EmptyBox text="Nemáš žádné blížící se nebo prošlé OP/OZ/IP." />
            ) : (
              <div className="list">
                {inspectionRows.map((row) => (
                  <a
                    href="/inspections"
                    key={`${row.elevator.id}-${row.type}`}
                    className="inspection-card"
                  >
                    <div className="inspection-line">
                      <span className="pill dark">{inspectionLabels[row.type]}</span>
                      <span className={row.status === "overdue" ? "pill red" : "pill amber"}>
                        {row.status === "overdue" ? "Po termínu" : "Blíží se"}
                      </span>
                    </div>

                    <strong>
                      {row.elevator.address} — {row.elevator.label}
                    </strong>

                    <p>
                      Poslední:{" "}
                      {row.lastDate
                        ? new Date(`${row.lastDate}T00:00:00`).toLocaleDateString(
                            "cs-CZ"
                          )
                        : "—"}{" "}
                      · Interval: {row.intervalText} · Další:{" "}
                      {formatDate(row.nextDate)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="stats-grid">
          <StatCard label="Výtahy" value={elevators.length} href="/elevators" />
          <StatCard label="Aktivní poruchy" value={activeFaults.length} href="/faults" />
          <StatCard label="Poruchy tento měsíc" value={faultsThisMonth} href="/faults" />
          <StatCard label="Aktivní technici" value={activeTechniciansCount} href="/technicians" />
          <StatCard label="Rajony" value={activeRegionsCount} href="/regions" />
        </section>
      </section>
    </main>
  );

  function FaultMiniCard({ fault, urgent }: { fault: Fault; urgent?: boolean }) {
    const helpers = faultAssignees
      .filter((item) => item.fault_id === fault.id && item.role === "spolupracovnik")
      .map((item) => getProfileName(item.profile_id));

    return (
      <a href="/faults" className={urgent ? "fault-card urgent" : "fault-card"}>
        <div className="fault-tags">
          <span className={urgent ? "pill red" : "pill amber"}>
            {priorityLabels[fault.priority]}
          </span>
          <span className="pill blue">{statusLabels[fault.status]}</span>
        </div>

        <strong>{getElevatorLabel(fault.elevator_id)}</strong>

        <p>{fault.description}</p>

        <div className="meta-text">
          Hlavní: {getProfileName(fault.main_technician_id)}
          {helpers.length > 0 ? ` · Spolu: ${helpers.join(", ")}` : ""}
        </div>
      </a>
    );
  }
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a className={active ? "nav-link active" : "nav-link"} href={href}>
      {label}
    </a>
  );
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={className ? `card ${className}` : "card"}>{children}</section>;
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="card-header">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div className="empty-box">{text}</div>;
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a href={href} className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </a>
  );
}

function StyleBlock() {
  return (
    <style>{`
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #020617;
      }

      .page-shell {
        min-height: 100vh;
        background: #020617;
        color: white;
        padding: 40px;
      }

      .app-layout {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 280px 1fr;
        background: #020617;
        color: #f8fafc;
      }

      .sidebar {
        background: #020617;
        border-right: 1px solid #1e293b;
        padding: 14px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .brand-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 18px;
        padding: 18px;
        margin-bottom: 18px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
      }

      .brand-kicker {
        color: #94a3b8;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.05em;
      }

      .brand-title {
        font-size: 23px;
        font-weight: 950;
        margin-top: 4px;
      }

      .brand-subtitle {
        color: #94a3b8;
        font-size: 13px;
        margin-top: 12px;
      }

      .side-label {
        color: #64748b;
        font-size: 12px;
        font-weight: 900;
        margin: 14px 0 8px;
      }

      .user-select {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 12px;
        color: #e2e8f0;
        margin-bottom: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nav {
        display: grid;
        gap: 8px;
      }

      .nav-link {
        display: block;
        padding: 13px 14px;
        border-radius: 13px;
        color: #cbd5e1;
        background: #0f172a;
        border: 1px solid #1e293b;
        text-decoration: none;
        font-weight: 800;
      }

      .nav-link:hover {
        border-color: #3b82f6;
      }

      .nav-link.active {
        background: #2563eb;
        color: white;
        border-color: #60a5fa;
      }

      .profile-card {
        margin-top: 16px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
        display: grid;
        gap: 5px;
        color: #94a3b8;
        font-size: 13px;
      }

      .profile-card strong {
        color: white;
        font-size: 15px;
      }

      .sidebar-fault-button {
        margin-top: 14px;
        width: 100%;
        min-height: 48px;
        background: #dc2626;
        color: white;
        border-radius: 13px;
        padding: 13px 14px;
        font-weight: 950;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 14px 30px rgba(220, 38, 38, 0.25);
      }

      .sidebar-fault-button:hover {
        background: #b91c1c;
      }

      .sidebar-notification-button {
        margin-top: 10px;
        width: 100%;
        min-height: 48px;
        border: 0;
        background: #2563eb;
        color: white;
        border-radius: 13px;
        padding: 13px 14px;
        font-weight: 950;
        cursor: pointer;
        box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
      }

      .sidebar-notification-button:hover {
        background: #1d4ed8;
      }

      .sidebar-notification-button:disabled {
        cursor: not-allowed;
        opacity: 0.65;
      }

      .sidebar-notification-message {
        margin-top: 10px;
        background: #020617;
        border: 1px solid #334155;
        color: #cbd5e1;
        border-radius: 12px;
        padding: 10px;
        font-size: 13px;
        line-height: 1.45;
      }

      .sidebar-spacer {
        flex: 1;
        min-height: 14px;
      }

      .logout-button {
        width: 100%;
        border: 0;
        background: #7f1d1d;
        color: #fecaca;
        border-radius: 13px;
        padding: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .content {
        padding: 34px;
        background: linear-gradient(180deg, #020617 0%, #0f172a 100%);
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
        flex-wrap: wrap;
        margin-bottom: 22px;
      }

      .topbar h1 {
        margin: 0 0 6px;
        font-size: 34px;
        font-weight: 950;
        letter-spacing: -0.04em;
      }

      .topbar p {
        margin: 0;
        color: #94a3b8;
      }

      .grid-main {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
        gap: 18px;
        margin-bottom: 18px;
      }

      .card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 24px;
        padding: 20px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
      }

      .urgent-card {
        margin-bottom: 18px;
      }

      .card-header {
        margin-bottom: 14px;
      }

      .card-header h2 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 950;
      }

      .card-header p {
        margin: 0;
        color: #94a3b8;
        font-size: 14px;
      }

      .empty-box {
        border: 1px dashed #334155;
        background: #020617;
        color: #94a3b8;
        border-radius: 16px;
        padding: 18px;
      }

      .list {
        display: grid;
        gap: 12px;
      }

      .fault-card,
      .message-card,
      .inspection-card {
        display: block;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 16px;
        color: white;
        text-decoration: none;
      }

      .fault-card:hover,
      .message-card:hover,
      .inspection-card:hover {
        border-color: #60a5fa;
      }

      .fault-card.urgent {
        border-color: #ef4444;
        background: #450a0a;
      }

      .fault-tags {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 900;
      }

      .pill.red {
        background: #7f1d1d;
        color: #fecaca;
        border: 1px solid #ef4444;
      }

      .pill.amber {
        background: #451a03;
        color: #fed7aa;
        border: 1px solid #f97316;
      }

      .pill.blue {
        background: #172554;
        color: #bfdbfe;
        border: 1px solid #3b82f6;
      }

      .pill.dark {
        background: #020617;
        color: #e2e8f0;
        border: 1px solid #334155;
      }

      .fault-card strong,
      .message-card strong,
      .inspection-card strong {
        font-size: 17px;
      }

      .fault-card p,
      .message-card p,
      .inspection-card p {
        color: #cbd5e1;
        margin: 8px 0 0;
        line-height: 1.45;
      }

      .meta-text,
      .date-text {
        color: #94a3b8;
        font-size: 13px;
        margin-top: 8px;
      }

      .inspection-line {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-top: 18px;
      }

      .stat-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 20px;
        padding: 18px;
        color: white;
        text-decoration: none;
      }

      .stat-card span {
        display: block;
        color: #94a3b8;
        font-size: 14px;
        margin-bottom: 8px;
      }

      .stat-card strong {
        display: block;
        font-size: 34px;
        font-weight: 950;
      }

      .error-box {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
        padding: 12px;
        border-radius: 12px;
        margin-bottom: 16px;
      }

    @media (max-width: 980px) {
  .app-layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: relative;
    min-height: 100vh;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid #1e293b;
  }

  .sidebar-spacer {
    display: block;
    flex: 1;
    min-height: 80px;
  }

  .content {
    padding: 18px;
  }

  .grid-main {
    grid-template-columns: 1fr;
  }
}

      @media (max-width: 720px) {
        .sidebar {
          padding: 12px;
        }

        .brand-card {
          padding: 14px;
          margin-bottom: 12px;
          border-radius: 16px;
        }

        .brand-title {
          font-size: 20px;
        }

        .brand-subtitle {
          margin-top: 8px;
        }

        .side-label {
          margin-top: 8px;
        }

        .user-select {
          white-space: normal;
          line-height: 1.4;
          padding: 11px;
          margin-bottom: 12px;
        }

        .nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .nav-link {
          min-height: 48px;
          padding: 12px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 14px;
        }

        .profile-card {
          margin-top: 12px;
          grid-template-columns: 1fr;
        }

        .sidebar-fault-button,
        .sidebar-notification-button,
        .logout-button {
          min-height: 48px;
        }

        .logout-button {
          margin-top: 10px;
        }

        .content {
          padding: 14px;
        }

        .topbar {
          display: grid;
          gap: 14px;
          margin-bottom: 16px;
        }

        .topbar h1 {
          font-size: 30px;
          line-height: 1.05;
        }

        .topbar p {
          font-size: 15px;
          line-height: 1.45;
        }

        .grid-main {
          gap: 14px;
          margin-bottom: 14px;
        }

        .urgent-card {
          margin-bottom: 14px;
        }

        .card {
          padding: 16px;
          border-radius: 20px;
        }

        .card-header h2 {
          font-size: 20px;
        }

        .card-header p {
          font-size: 13px;
          line-height: 1.45;
        }

        .fault-card,
        .message-card,
        .inspection-card,
        .empty-box {
          padding: 14px;
          border-radius: 15px;
        }

        .fault-card strong,
        .message-card strong,
        .inspection-card strong {
          font-size: 16px;
          line-height: 1.35;
        }

        .fault-card p,
        .message-card p,
        .inspection-card p {
          font-size: 14px;
        }

        .pill {
          font-size: 11px;
          padding: 5px 9px;
        }

        .stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .stat-card {
          padding: 14px;
          border-radius: 17px;
        }

        .stat-card strong {
          font-size: 28px;
        }
      }

      @media (max-width: 430px) {
        .nav {
          grid-template-columns: 1fr;
        }

        .content {
          padding: 12px;
        }

        .topbar h1 {
          font-size: 28px;
        }

        .stats-grid {
          grid-template-columns: 1fr;
        }

        .card {
          padding: 14px;
        }
      }
    `}</style>
  );
}