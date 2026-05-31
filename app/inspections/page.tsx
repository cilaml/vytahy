"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

type InspectionType = "op" | "oz" | "ip";

type Region = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type ProfileRegion = {
  id: string;
  profile_id: string;
  region_id: string;
};

type Elevator = {
  id: string;
  label: string;
  address: string;
  region_id: string | null;
  serial_number: string | null;
  pr_number: string | null;
  pl_number: string | null;
  status: "aktivni" | "vyrazeny";
  inspection_technician_id: string | null;
  last_op_date: string | null;
  op_interval_months: number;
  last_oz_date: string | null;
  oz_interval_months: number;
  last_ip_date: string | null;
  ip_interval_years: number;
};

type InspectionEvent = {
  id: string;
  elevator_id: string;
  profile_id: string | null;
  type: InspectionType;
  performed_date: string;
  note: string | null;
  created_at: string;
};

type InspectionRow = {
  elevator: Elevator;
  type: InspectionType;
  label: string;
  lastDate: string | null;
  nextDate: Date | null;
  status: "ok" | "soon" | "overdue" | "missing";
  intervalText: string;
};

const inspectionLabels: Record<InspectionType, string> = {
  op: "OP",
  oz: "OZ",
  ip: "IP",
};

const statusLabels: Record<InspectionRow["status"], string> = {
  ok: "OK",
  soon: "Blíží se",
  overdue: "Po termínu",
  missing: "Nezadáno",
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy" },
  { href: "/service", label: "Servis" },
  { href: "/elevators", label: "Výtahy" },
  { href: "/technicians", label: "Technici" },
  { href: "/inspections", label: "Revize", active: true },
  { href: "/regions", label: "Rajony" },
];

export default function InspectionsPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);
  const [inspectionEvents, setInspectionEvents] = useState<InspectionEvent[]>(
    []
  );

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<InspectionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ok" | "soon" | "overdue" | "missing"
  >("all");

  const [confirmingRowKey, setConfirmingRowKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  const canConfirmInspections =
    isAdminOrLead || currentProfile?.can_do_inspections === true;

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    return (
      regions.find((region) => region.id === regionId)?.name ??
      "Neznámý rajon"
    );
  }

  function getProfileName(profileId: string | null) {
    if (!profileId) return "Nepřiřazen";

    return (
      profiles.find((profile) => profile.id === profileId)?.full_name ??
      "Neznámý technik"
    );
  }

  function getRoleLabel(role: string | undefined) {
    if (role === "admin") return "Admin";
    if (role === "vedouci_technik") return "Vedoucí technik";
    if (role === "technik") return "Technik";
    if (role === "sekretariat") return "Sekretariát";
    if (role === "servis") return "Servis";
    return role || "Uživatel";
  }

  function canCurrentUserSeeElevator(elevator: Elevator) {
    if (!currentProfile) return false;

    if (isAdminOrLead) return true;

    if (currentProfile.can_do_inspections) {
      if (elevator.inspection_technician_id === currentProfile.id) {
        return true;
      }

      if (currentProfile.primary_region_id === elevator.region_id) {
        return true;
      }

      return profileRegions.some(
        (item) =>
          item.profile_id === currentProfile.id &&
          item.region_id === elevator.region_id
      );
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

  function formatStoredDate(value: string | null) {
    if (!value) return "—";
    return new Date(`${value}T00:00:00`).toLocaleDateString("cs-CZ");
  }

  function getStatus(nextDate: Date | null): InspectionRow["status"] {
    if (!nextDate) return "missing";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limitSoon = new Date(today);
    limitSoon.setDate(limitSoon.getDate() + 30);

    if (nextDate < today) return "overdue";
    if (nextDate <= limitSoon) return "soon";
    return "ok";
  }

  function buildInspectionRows(elevator: Elevator): InspectionRow[] {
    const lastOp = parseDate(elevator.last_op_date);
    const nextOp = lastOp
      ? addMonths(lastOp, elevator.op_interval_months || 3)
      : null;

    const lastOz = parseDate(elevator.last_oz_date);
    const nextOz = lastOz
      ? addMonths(lastOz, elevator.oz_interval_months || 36)
      : null;

    const lastIp = parseDate(elevator.last_ip_date);
    const nextIp = lastIp
      ? addYears(lastIp, elevator.ip_interval_years || 6)
      : null;

    return [
      {
        elevator,
        type: "op",
        label: "OP",
        lastDate: elevator.last_op_date,
        nextDate: nextOp,
        status: getStatus(nextOp),
        intervalText: `${elevator.op_interval_months || 3} měs.`,
      },
      {
        elevator,
        type: "oz",
        label: "OZ",
        lastDate: elevator.last_oz_date,
        nextDate: nextOz,
        status: getStatus(nextOz),
        intervalText: `${elevator.oz_interval_months || 36} měs.`,
      },
      {
        elevator,
        type: "ip",
        label: "IP",
        lastDate: elevator.last_ip_date,
        nextDate: nextIp,
        status: getStatus(nextIp),
        intervalText: `${elevator.ip_interval_years || 6} let`,
      },
    ];
  }

  const visibleElevators = useMemo(() => {
    return elevators.filter((elevator) => canCurrentUserSeeElevator(elevator));
  }, [elevators, currentProfile, profileRegions]);

  const inspectionRows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return visibleElevators
      .flatMap((elevator) => buildInspectionRows(elevator))
      .filter((row) => {
        const elevator = row.elevator;

        const matchesSearch = text
          ? [
              elevator.address,
              elevator.label,
              elevator.serial_number,
              elevator.pr_number,
              elevator.pl_number,
              getRegionName(elevator.region_id),
              getProfileName(elevator.inspection_technician_id),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(text)
          : true;

        const matchesRegion = regionFilter
          ? elevator.region_id === regionFilter
          : true;

        const matchesTechnician = technicianFilter
          ? elevator.inspection_technician_id === technicianFilter
          : true;

        const matchesType =
          typeFilter === "all" ? true : row.type === typeFilter;

        const matchesStatus =
          statusFilter === "all" ? true : row.status === statusFilter;

        return (
          matchesSearch &&
          matchesRegion &&
          matchesTechnician &&
          matchesType &&
          matchesStatus
        );
      })
      .sort((a, b) => {
        const statusWeight: Record<InspectionRow["status"], number> = {
          overdue: 0,
          soon: 1,
          missing: 2,
          ok: 3,
        };

        const statusDiff = statusWeight[a.status] - statusWeight[b.status];
        if (statusDiff !== 0) return statusDiff;

        const aTime = a.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.nextDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return aTime - bTime;
      });
  }, [
    visibleElevators,
    search,
    regionFilter,
    technicianFilter,
    typeFilter,
    statusFilter,
    regions,
    profiles,
  ]);

  const inspectionTechnicians = useMemo(() => {
    return profiles
      .filter((profile) => profile.can_do_inspections && profile.active)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "cs"));
  }, [profiles]);

  const latestInspectionEvents = useMemo(() => {
    return inspectionEvents
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20);
  }, [inspectionEvents]);

  const overdueCount = useMemo(() => {
    return inspectionRows.filter((row) => row.status === "overdue").length;
  }, [inspectionRows]);

  const soonCount = useMemo(() => {
    return inspectionRows.filter((row) => row.status === "soon").length;
  }, [inspectionRows]);

  const missingCount = useMemo(() => {
    return inspectionRows.filter((row) => row.status === "missing").length;
  }, [inspectionRows]);

  const okCount = useMemo(() => {
    return inspectionRows.filter((row) => row.status === "ok").length;
  }, [inspectionRows]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data: currentProfileData, error: currentProfileError } =
      await supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .eq("id", user.id)
        .maybeSingle();

    if (currentProfileError) {
      setMessage(`Chyba při načítání profilu: ${currentProfileError.message}`);
      setLoading(false);
      return;
    }

    if (!currentProfileData) {
      setMessage("Profil přihlášeného uživatele nebyl nalezen.");
      setLoading(false);
      return;
    }

    const [
      elevatorsResult,
      regionsResult,
      profilesResult,
      profileRegionsResult,
      inspectionEventsResult,
    ] = await Promise.all([
      supabase
        .from("elevators")
        .select(
          "id, label, address, region_id, serial_number, pr_number, pl_number, status, inspection_technician_id, last_op_date, op_interval_months, last_oz_date, oz_interval_months, last_ip_date, ip_interval_years"
        )
        .order("address", { ascending: true }),

      supabase
        .from("regions")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .order("full_name", { ascending: true }),

      supabase.from("profile_regions").select("id, profile_id, region_id"),

      supabase
        .from("inspection_events")
        .select(
          "id, elevator_id, profile_id, type, performed_date, note, created_at"
        )
        .order("created_at", { ascending: false }),
    ]);

    const error =
      elevatorsResult.error ||
      regionsResult.error ||
      profilesResult.error ||
      profileRegionsResult.error ||
      inspectionEventsResult.error;

    if (error) {
      setMessage(`Chyba při načítání revizí: ${error.message}`);
      setLoading(false);
      return;
    }

    setCurrentProfile(currentProfileData as Profile);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setRegions((regionsResult.data ?? []) as Region[]);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setProfileRegions((profileRegionsResult.data ?? []) as ProfileRegion[]);
    setInspectionEvents(
      (inspectionEventsResult.data ?? []) as InspectionEvent[]
    );

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function confirmInspection(row: InspectionRow) {
    if (!currentProfile) {
      setMessage("Nejsi přihlášený.");
      setSuccessMessage("");
      return;
    }

    if (!canConfirmInspections) {
      setMessage("Nemáš oprávnění potvrzovat OP/OZ/IP.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu potvrdit hotovou ${inspectionLabels[row.type]} pro výtah ${row.elevator.address} · ${row.elevator.label}?`
    );

    if (!confirmed) return;

    const rowKey = `${row.elevator.id}-${row.type}`;

    setConfirmingRowKey(rowKey);
    setMessage("");
    setSuccessMessage(`Potvrzuji ${inspectionLabels[row.type]}...`);

    const supabase = createClient();

    const today = new Date().toISOString().slice(0, 10);

    const updatePayload =
      row.type === "op"
        ? { last_op_date: today, updated_at: new Date().toISOString() }
        : row.type === "oz"
          ? { last_oz_date: today, updated_at: new Date().toISOString() }
          : { last_ip_date: today, updated_at: new Date().toISOString() };

    const { error: updateError } = await supabase
      .from("elevators")
      .update(updatePayload)
      .eq("id", row.elevator.id);

    if (updateError) {
      setConfirmingRowKey(null);
      setSuccessMessage("");
      setMessage(
        `Nepodařilo se aktualizovat výtah. Pokud jsi revizní technik a nejsi admin, bude potřeba doplnit práva pro update výtahů: ${updateError.message}`
      );
      return;
    }

    const { error: eventError } = await supabase
      .from("inspection_events")
      .insert({
        elevator_id: row.elevator.id,
        profile_id: currentProfile.id,
        type: row.type,
        performed_date: today,
        note: `${inspectionLabels[row.type]} potvrzena jako hotová.`,
      });

    if (eventError) {
      setConfirmingRowKey(null);
      setSuccessMessage("");
      setMessage(
        `Datum revize bylo aktualizováno, ale nepovedlo se zapsat událost: ${eventError.message}`
      );
      await loadData();
      return;
    }

    setConfirmingRowKey(null);
    setSuccessMessage(`${inspectionLabels[row.type]} byla potvrzena.`);
    await loadData();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main style={styles.appLayout}>
        <aside style={styles.sidebar}>
          <div style={styles.brandCard}>
            <div style={styles.brandEyebrow}>Servisní systém</div>
            <div style={styles.brandTitle}>Výtahy Servis</div>
            <div style={styles.brandSubtitle}>
              Databáze, poruchy, servis a revize
            </div>
          </div>
        </aside>

        <section style={styles.content}>
          <div style={styles.emptyInner}>Načítám revize...</div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.appLayout}>
      <aside style={styles.sidebar}>
        <div style={styles.brandCard}>
          <div style={styles.brandEyebrow}>Servisní systém</div>
          <div style={styles.brandTitle}>Výtahy Servis</div>
          <div style={styles.brandSubtitle}>
            Databáze, poruchy, servis a revize
          </div>
        </div>

        <div>
          <div style={styles.sidebarLabel}>Přihlášený uživatel</div>
          <div style={styles.userBox}>
            {(currentProfile?.full_name || currentProfile?.email || "Uživatel") +
              " — " +
              getRoleLabel(currentProfile?.role)}
          </div>
        </div>

        <nav style={styles.nav}>
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...styles.navLink,
                ...(item.active ? styles.navLinkActive : {}),
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.sidebarFooterName}>
            {currentProfile?.full_name || "Uživatel"}
          </div>
          <div style={styles.sidebarFooterText}>
            Role: {getRoleLabel(currentProfile?.role)}
          </div>
          <div style={styles.sidebarFooterText}>
            Rajon: {getRegionName(currentProfile?.primary_region_id ?? null)}
          </div>
          <div style={styles.sidebarFooterText}>
            Revize: {currentProfile?.can_do_inspections ? "Ano" : "Ne"}
          </div>
        </div>

        <button onClick={signOut} style={styles.logoutButton}>
          Odhlásit
        </button>
      </aside>

      <section style={styles.content}>
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.pageTitle}>Revize OP / OZ / IP</h1>
            <p style={styles.pageDescription}>
              Přehled termínů, potvrzení hotových kontrol a archiv provedených
              revizí.
            </p>
          </div>

          <div style={styles.topbarActions}>
            <Link href="/inspections/print" style={styles.printLinkButton}>
              Tisk podle revizáka
            </Link>

            <Link href="/elevators" style={styles.primaryLinkButton}>
              Databáze výtahů
            </Link>
          </div>
        </div>

        {message && <div style={styles.errorBox}>{message}</div>}
        {successMessage && (
          <div style={styles.successBox}>{successMessage}</div>
        )}

        <section style={styles.topGrid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Přehled revizí</h2>
                <p style={styles.cardDescription}>
                  Termíny jsou počítané z posledního data a nastaveného
                  intervalu u výtahu.
                </p>
              </div>
            </div>

            <div style={styles.statGrid}>
              <MiniStat
                label="Po termínu"
                value={String(overdueCount)}
                description="vyžaduje řešení"
                tone={overdueCount > 0 ? "red" : "default"}
              />
              <MiniStat
                label="Blíží se"
                value={String(soonCount)}
                description="do 30 dnů"
                tone={soonCount > 0 ? "orange" : "default"}
              />
              <MiniStat
                label="Nezadáno"
                value={String(missingCount)}
                description="chybí poslední datum"
                tone={missingCount > 0 ? "blue" : "default"}
              />
              <MiniStat
                label="OK"
                value={String(okCount)}
                description="v termínu"
                tone="green"
              />
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Oprávnění</h2>
                <p style={styles.cardDescription}>
                  Potvrzování revizí podle role uživatele.
                </p>
              </div>
            </div>

            <div style={styles.emptyInner}>
              {canConfirmInspections
                ? "Můžeš potvrzovat hotové OP/OZ/IP."
                : "Nemáš oprávnění potvrzovat OP/OZ/IP."}
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Filtry</h2>
              <p style={styles.cardDescription}>
                Zobrazeno {inspectionRows.length} revizních řádků.
              </p>
            </div>

            <button onClick={loadData} style={styles.secondaryButton}>
              Obnovit
            </button>
          </div>

          <div style={styles.filters}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat adresu, označení, PR, PL, výrobní číslo..."
              style={styles.searchInput}
            />

            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všechny rajony</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>

            <select
              value={technicianFilter}
              onChange={(event) => setTechnicianFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všichni revizní technici</option>
              {inspectionTechnicians.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as InspectionType | "all")
              }
              style={styles.filterSelect}
            >
              <option value="all">OP + OZ + IP</option>
              <option value="op">Jen OP</option>
              <option value="oz">Jen OZ</option>
              <option value="ip">Jen IP</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "all"
                    | "ok"
                    | "soon"
                    | "overdue"
                    | "missing"
                )
              }
              style={styles.filterSelect}
            >
              <option value="all">Všechny stavy</option>
              <option value="overdue">Po termínu</option>
              <option value="soon">Blíží se</option>
              <option value="missing">Nezadáno</option>
              <option value="ok">OK</option>
            </select>
          </div>
        </section>

        <section style={styles.inspectionList}>
          {inspectionRows.length === 0 && (
            <div style={styles.emptyInner}>Žádné revize pro vybraný filtr.</div>
          )}

          {inspectionRows.map((row) => {
            const statusStyle = getStatusStyle(row.status);
            const rowKey = `${row.elevator.id}-${row.type}`;
            const isConfirming = confirmingRowKey === rowKey;

            return (
              <article
                key={rowKey}
                style={{
                  ...styles.inspectionCard,
                  borderColor: statusStyle.border,
                }}
              >
                <div style={styles.inspectionTop}>
                  <div>
                    <div style={styles.titleRow}>
                      <span style={styles.typeBadge}>{row.label}</span>

                      <span
                        style={{
                          ...styles.statusBadge,
                          background: statusStyle.background,
                          borderColor: statusStyle.border,
                          color: statusStyle.color,
                        }}
                      >
                        {statusLabels[row.status]}
                      </span>
                    </div>

                    <h2 style={styles.elevatorTitle}>{row.elevator.address}</h2>

                    <div style={styles.elevatorSubtitle}>
                      {row.elevator.label}
                    </div>

                    <div style={styles.elevatorMeta}>
                      Rajon: {getRegionName(row.elevator.region_id)}
                    </div>

                    <div style={styles.elevatorMeta}>
                      Revizní technik:{" "}
                      {getProfileName(row.elevator.inspection_technician_id)}
                    </div>

                    <div style={styles.elevatorMeta}>
                      PR: {row.elevator.pr_number || "—"} · PL:{" "}
                      {row.elevator.pl_number || "—"} · Výr. č.:{" "}
                      {row.elevator.serial_number || "—"}
                    </div>
                  </div>

                  <div style={styles.dateBox}>
                    <InfoLine
                      label="Poslední"
                      value={formatStoredDate(row.lastDate)}
                    />
                    <InfoLine label="Další" value={formatDate(row.nextDate)} />
                    <InfoLine label="Interval" value={row.intervalText} />

                    <button
                      disabled={isConfirming || !canConfirmInspections}
                      onClick={() => confirmInspection(row)}
                      style={{
                        ...styles.confirmButton,
                        background: canConfirmInspections
                          ? "#16a34a"
                          : "#475569",
                        cursor: canConfirmInspections
                          ? "pointer"
                          : "not-allowed",
                        opacity: isConfirming ? 0.7 : 1,
                      }}
                    >
                      {isConfirming
                        ? "Potvrzuji..."
                        : `Potvrdit ${inspectionLabels[row.type]}`}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Poslední potvrzené revize</h2>
              <p style={styles.cardDescription}>
                Posledních 20 událostí z tabulky inspection_events.
              </p>
            </div>
          </div>

          <div style={styles.eventsList}>
            {latestInspectionEvents.length === 0 && (
              <div style={styles.emptyInner}>
                Zatím tu nejsou žádné potvrzené revize.
              </div>
            )}

            {latestInspectionEvents.map((event) => (
              <div key={event.id} style={styles.eventCard}>
                <div style={styles.eventTop}>
                  <strong>{inspectionLabels[event.type]}</strong>

                  <span>{new Date(event.created_at).toLocaleString("cs-CZ")}</span>
                </div>

                <div style={styles.eventMeta}>
                  Provedl: {getProfileName(event.profile_id)}
                </div>

                <div style={styles.eventMeta}>
                  Datum provedení:{" "}
                  {new Date(`${event.performed_date}T00:00:00`).toLocaleDateString(
                    "cs-CZ"
                  )}
                </div>

                {event.note && <div style={styles.eventNote}>{event.note}</div>}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function MiniStat({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "default" | "green" | "red" | "orange" | "blue";
}) {
  let valueStyle = styles.statValue;

  if (tone === "green") {
    valueStyle = {
      ...styles.statValue,
      color: "#86efac",
    };
  }

  if (tone === "red") {
    valueStyle = {
      ...styles.statValue,
      color: "#fca5a5",
    };
  }

  if (tone === "orange") {
    valueStyle = {
      ...styles.statValue,
      color: "#fed7aa",
    };
  }

  if (tone === "blue") {
    valueStyle = {
      ...styles.statValue,
      color: "#bfdbfe",
    };
  }

  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div style={valueStyle}>{value}</div>
      <div style={styles.statDescription}>{description}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getStatusStyle(status: InspectionRow["status"]) {
  if (status === "overdue") {
    return {
      background: "#450a0a",
      border: "#ef4444",
      color: "#fecaca",
    };
  }

  if (status === "soon") {
    return {
      background: "#451a03",
      border: "#f97316",
      color: "#fed7aa",
    };
  }

  if (status === "missing") {
    return {
      background: "#172554",
      border: "#3b82f6",
      color: "#bfdbfe",
    };
  }

  return {
    background: "#052e16",
    border: "#16a34a",
    color: "#bbf7d0",
  };
}

const styles: Record<string, CSSProperties> = {
  appLayout: {
    minHeight: "100vh",
    background: "#020617",
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "280px 1fr",
  },

  sidebar: {
    background: "#020617",
    borderRight: "1px solid #1e293b",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
  },

  brandCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 8,
  },

  brandEyebrow: {
    color: "#93c5fd",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 10,
  },

  brandTitle: {
    fontSize: 23,
    fontWeight: 950,
    marginBottom: 18,
  },

  brandSubtitle: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 1.5,
  },

  sidebarLabel: {
    color: "#64748b",
    textTransform: "uppercase",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 8,
  },

  userBox: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "13px 14px",
    color: "#f8fafc",
    marginBottom: 4,
  },

  nav: {
    display: "grid",
    gap: 8,
  },

  navLink: {
    display: "block",
    textDecoration: "none",
    background: "#0f172a",
    border: "1px solid #1e293b",
    color: "#f8fafc",
    borderRadius: 12,
    padding: "14px 15px",
    fontWeight: 900,
  },

  navLinkActive: {
    background: "#2563eb",
    borderColor: "#60a5fa",
  },

  sidebarFooter: {
    marginTop: "auto",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 14,
  },

  sidebarFooterName: {
    color: "#f8fafc",
    fontWeight: 900,
    marginBottom: 6,
  },

  sidebarFooterText: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 1.6,
  },

  logoutButton: {
    background: "#991b1b",
    border: "1px solid #7f1d1d",
    color: "#fee2e2",
    borderRadius: 13,
    padding: "13px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  content: {
    padding: "34px 38px",
    display: "grid",
    gap: 18,
    alignContent: "start",
  },

  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
  },

  topbarActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  pageTitle: {
    margin: 0,
    fontSize: 36,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },

  pageDescription: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    fontSize: 16,
  },

  primaryLinkButton: {
    background: "#2563eb",
    color: "white",
    border: 0,
    borderRadius: 15,
    padding: "14px 20px",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    textDecoration: "none",
    boxShadow: "0 18px 40px rgba(37,99,235,0.22)",
  },

  printLinkButton: {
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: 15,
    padding: "14px 20px",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    textDecoration: "none",
  },

  secondaryButton: {
    background: "#1e293b",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "11px 15px",
    fontWeight: 900,
    cursor: "pointer",
  },

  errorBox: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    padding: 13,
    borderRadius: 14,
  },

  successBox: {
    background: "#052e16",
    border: "1px solid #166534",
    color: "#bbf7d0",
    padding: 13,
    borderRadius: 14,
  },

  topGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 18,
  },

  card: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 24,
    padding: 22,
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },

  cardTitle: {
    margin: 0,
    fontSize: 25,
    fontWeight: 950,
    letterSpacing: "-0.02em",
  },

  cardDescription: {
    color: "#93a4bd",
    margin: "5px 0 0",
    fontSize: 14,
  },

  emptyInner: {
    background: "#020617",
    border: "1px dashed #334155",
    borderRadius: 15,
    padding: 17,
    color: "#cbd5e1",
  },

  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
    gap: 12,
  },

  statBox: {
    background: "#020617",
    border: "1px solid #1e293b",
    borderRadius: 16,
    padding: 14,
  },

  statLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 900,
  },

  statValue: {
    marginTop: 6,
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: 950,
  },

  statDescription: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 13,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 180px 240px 150px 170px",
    gap: 12,
  },

  searchInput: {
    background: "#020617",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 13,
    padding: 13,
    outline: "none",
  },

  filterSelect: {
    background: "#020617",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 13,
    padding: 13,
    outline: "none",
  },

  inspectionList: {
    display: "grid",
    gap: 12,
  },

  inspectionCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 20,
    padding: 18,
  },

  inspectionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },

  titleRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 8,
  },

  typeBadge: {
    background: "#020617",
    border: "1px solid #334155",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "6px 11px",
    fontSize: 15,
    fontWeight: 950,
  },

  statusBadge: {
    border: "1px solid",
    borderRadius: 999,
    padding: "6px 11px",
    fontSize: 13,
    fontWeight: 950,
  },

  elevatorTitle: {
    fontSize: 21,
    fontWeight: 950,
    margin: 0,
    marginBottom: 6,
  },

  elevatorSubtitle: {
    color: "#cbd5e1",
    marginBottom: 5,
  },

  elevatorMeta: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 1.5,
  },

  dateBox: {
    minWidth: 250,
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 14,
    display: "grid",
    gap: 8,
  },

  infoLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#cbd5e1",
    fontSize: 14,
  },

  confirmButton: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: 0,
    color: "white",
    fontWeight: 900,
    marginTop: 6,
  },

  eventsList: {
    display: "grid",
    gap: 10,
  },

  eventCard: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 14,
  },

  eventTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    color: "#f8fafc",
    marginBottom: 8,
  },

  eventMeta: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 1.5,
  },

  eventNote: {
    color: "#cbd5e1",
    marginTop: 8,
    lineHeight: 1.5,
  },
};