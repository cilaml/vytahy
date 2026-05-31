"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Region = {
  id: string;
  name: string;
  active: boolean;
};

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  primary_region_id: string | null;
  active: boolean;
  can_do_inspections?: boolean;
};

type InspectionTechnician = {
  id: string;
  full_name: string;
  email: string;
  can_do_inspections: boolean;
  active: boolean;
};

type ElevatorStatus = "aktivni" | "vyrazeny";

type Elevator = {
  id: string;
  label: string;
  address: string;
  region_id: string | null;
  serial_number: string | null;
  year_built: number | null;
  elevator_type: string | null;
  pr_number: string | null;
  pl_number: string | null;
  manufacturer: string | null;
  capacity: string | null;
  stations_count: number | null;
  note: string | null;
  status: ElevatorStatus;
  contact_company: string | null;
  contact_manager: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  inspection_technician_id: string | null;
  last_op_date: string | null;
  op_interval_months: number;
  last_oz_date: string | null;
  oz_interval_months: number;
  last_ip_date: string | null;
  ip_interval_years: number;
  created_at: string;
};

type ElevatorForm = {
  id?: string;
  label: string;
  address: string;
  region_id: string;
  serial_number: string;
  year_built: string;
  elevator_type: string;
  pr_number: string;
  pl_number: string;
  manufacturer: string;
  capacity: string;
  stations_count: string;
  note: string;
  status: ElevatorStatus;
  contact_company: string;
  contact_manager: string;
  contact_phone: string;
  contact_email: string;
  inspection_technician_id: string;
  last_op_date: string;
  op_interval_months: string;
  last_oz_date: string;
  oz_interval_months: string;
  last_ip_date: string;
  ip_interval_years: string;
};

const emptyForm: ElevatorForm = {
  label: "",
  address: "",
  region_id: "",
  serial_number: "",
  year_built: "",
  elevator_type: "",
  pr_number: "",
  pl_number: "",
  manufacturer: "",
  capacity: "",
  stations_count: "",
  note: "",
  status: "aktivni",
  contact_company: "",
  contact_manager: "",
  contact_phone: "",
  contact_email: "",
  inspection_technician_id: "",
  last_op_date: "",
  op_interval_months: "3",
  last_oz_date: "",
  oz_interval_months: "36",
  last_ip_date: "",
  ip_interval_years: "6",
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy" },
  { href: "/service", label: "Servis" },
  { href: "/elevators", label: "Výtahy", active: true },
  { href: "/technicians", label: "Technici" },
  { href: "/inspections", label: "Revize" },
  { href: "/regions", label: "Rajony" },
];

const baseElevatorSelect =
  "id, label, address, region_id, serial_number, year_built, elevator_type, pr_number, pl_number, manufacturer, capacity, stations_count, note, status, inspection_technician_id, last_op_date, op_interval_months, last_oz_date, oz_interval_months, last_ip_date, ip_interval_years, created_at";

const contactElevatorSelect =
  "contact_company, contact_manager, contact_phone, contact_email";

function roleCanViewElevatorContacts(role: string | undefined) {
  return (
    role === "admin" ||
    role === "vedouci_technik" ||
    role === "sekretariat"
  );
}

function roleCanManageElevators(role: string | undefined) {
  return (
    role === "admin" ||
    role === "vedouci_technik" ||
    role === "sekretariat"
  );
}

function roleCanDeleteElevators(role: string | undefined) {
  return role === "admin" || role === "vedouci_technik";
}

export default function ElevatorsPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [inspectionTechnicians, setInspectionTechnicians] = useState<
    InspectionTechnician[]
  >([]);

  const [form, setForm] = useState<ElevatorForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingElevatorId, setDeletingElevatorId] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canViewElevatorContacts = roleCanViewElevatorContacts(
    currentProfile?.role
  );

  const canManageElevators = roleCanManageElevators(currentProfile?.role);

  const canDeleteElevators = roleCanDeleteElevators(currentProfile?.role);

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    return (
      regions.find((region) => region.id === regionId)?.name ?? "Neznámý rajon"
    );
  }

  function getInspectionTechnicianName(profileId: string | null) {
    if (!profileId) return "Nepřiřazen";

    return (
      inspectionTechnicians.find((technician) => technician.id === profileId)
        ?.full_name ?? "Neznámý technik"
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

  function normalizeElevator(raw: Partial<Elevator>): Elevator {
    return {
      id: raw.id ?? "",
      label: raw.label ?? "",
      address: raw.address ?? "",
      region_id: raw.region_id ?? null,
      serial_number: raw.serial_number ?? null,
      year_built: raw.year_built ?? null,
      elevator_type: raw.elevator_type ?? null,
      pr_number: raw.pr_number ?? null,
      pl_number: raw.pl_number ?? null,
      manufacturer: raw.manufacturer ?? null,
      capacity: raw.capacity ?? null,
      stations_count: raw.stations_count ?? null,
      note: raw.note ?? null,
      status: raw.status ?? "aktivni",
      contact_company: raw.contact_company ?? null,
      contact_manager: raw.contact_manager ?? null,
      contact_phone: raw.contact_phone ?? null,
      contact_email: raw.contact_email ?? null,
      inspection_technician_id: raw.inspection_technician_id ?? null,
      last_op_date: raw.last_op_date ?? null,
      op_interval_months: raw.op_interval_months ?? 3,
      last_oz_date: raw.last_oz_date ?? null,
      oz_interval_months: raw.oz_interval_months ?? 36,
      last_ip_date: raw.last_ip_date ?? null,
      ip_interval_years: raw.ip_interval_years ?? 6,
      created_at: raw.created_at ?? "",
    };
  }

  const filteredElevators = useMemo(() => {
    const text = search.trim().toLowerCase();

    return elevators.filter((elevator) => {
      const matchesRegion = regionFilter
        ? elevator.region_id === regionFilter
        : true;

      const matchesStatus = statusFilter
        ? elevator.status === statusFilter
        : true;

      const searchableBase = [
        elevator.label,
        elevator.address,
        elevator.serial_number,
        elevator.pr_number,
        elevator.pl_number,
        elevator.manufacturer,
        elevator.elevator_type,
        elevator.capacity,
        getRegionName(elevator.region_id),
        getInspectionTechnicianName(elevator.inspection_technician_id),
      ];

      const searchableWithContacts = canViewElevatorContacts
        ? [
            ...searchableBase,
            elevator.contact_company,
            elevator.contact_manager,
            elevator.contact_phone,
            elevator.contact_email,
          ]
        : searchableBase;

      const searchable = searchableWithContacts
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = text ? searchable.includes(text) : true;

      return matchesRegion && matchesStatus && matchesSearch;
    });
  }, [
    elevators,
    search,
    regionFilter,
    statusFilter,
    regions,
    inspectionTechnicians,
    canViewElevatorContacts,
  ]);

  const activeElevatorsCount = useMemo(() => {
    return elevators.filter((elevator) => elevator.status === "aktivni").length;
  }, [elevators]);

  const inactiveElevatorsCount = useMemo(() => {
    return elevators.filter((elevator) => elevator.status === "vyrazeny").length;
  }, [elevators]);

  const elevatorsWithoutRegionCount = useMemo(() => {
    return elevators.filter((elevator) => !elevator.region_id).length;
  }, [elevators]);

  const elevatorsWithoutInspectionTechnicianCount = useMemo(() => {
    return elevators.filter((elevator) => !elevator.inspection_technician_id)
      .length;
  }, [elevators]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let loadedProfile: Profile | null = null;

    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, active, can_do_inspections"
        )
        .eq("id", user.id)
        .maybeSingle();

      loadedProfile = (profileData ?? null) as Profile | null;
    }

    const canLoadContactColumns = roleCanViewElevatorContacts(
      loadedProfile?.role
    );

    const elevatorSelect = canLoadContactColumns
  ? `${baseElevatorSelect},${contactElevatorSelect}`
  : baseElevatorSelect;

    const { data: elevatorsData, error: elevatorsError } = await supabase
      .from("elevators")
      .select(elevatorSelect)
      .order("address", { ascending: true });

    if (elevatorsError) {
      setMessage(`Chyba při načítání výtahů: ${elevatorsError.message}`);
      setLoading(false);
      return;
    }

    const { data: regionsData, error: regionsError } = await supabase
      .from("regions")
      .select("id, name, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (regionsError) {
      setMessage(`Chyba při načítání rajonů: ${regionsError.message}`);
      setLoading(false);
      return;
    }

    const { data: techniciansData, error: techniciansError } = await supabase
      .from("profiles")
      .select("id, full_name, email, can_do_inspections, active")
      .eq("can_do_inspections", true)
      .eq("active", true)
      .order("full_name", { ascending: true });

    if (techniciansError) {
      setMessage(
        `Chyba při načítání revizních techniků: ${techniciansError.message}`
      );
      setLoading(false);
      return;
    }

    setCurrentProfile(loadedProfile);
    setElevators(
  ((elevatorsData ?? []) as unknown as Partial<Elevator>[]).map((item) =>
    normalizeElevator(item)
  )
);
    setRegions((regionsData ?? []) as Region[]);
    setInspectionTechnicians(
      (techniciansData ?? []) as InspectionTechnician[]
    );
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function startCreate() {
    if (!canManageElevators) {
      setMessage("Nemáš oprávnění přidávat výtahy.");
      setSuccessMessage("");
      return;
    }

    setMessage("");
    setSuccessMessage("");
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(elevator: Elevator) {
    if (!canManageElevators) {
      setMessage("Nemáš oprávnění upravovat výtahy.");
      setSuccessMessage("");
      return;
    }

    setMessage("");
    setSuccessMessage("");

    setForm({
      id: elevator.id,
      label: elevator.label ?? "",
      address: elevator.address ?? "",
      region_id: elevator.region_id ?? "",
      serial_number: elevator.serial_number ?? "",
      year_built: elevator.year_built ? String(elevator.year_built) : "",
      elevator_type: elevator.elevator_type ?? "",
      pr_number: elevator.pr_number ?? "",
      pl_number: elevator.pl_number ?? "",
      manufacturer: elevator.manufacturer ?? "",
      capacity: elevator.capacity ?? "",
      stations_count: elevator.stations_count
        ? String(elevator.stations_count)
        : "",
      note: elevator.note ?? "",
      status: elevator.status,
      contact_company: canViewElevatorContacts
        ? elevator.contact_company ?? ""
        : "",
      contact_manager: canViewElevatorContacts
        ? elevator.contact_manager ?? ""
        : "",
      contact_phone: canViewElevatorContacts ? elevator.contact_phone ?? "" : "",
      contact_email: canViewElevatorContacts ? elevator.contact_email ?? "" : "",
      inspection_technician_id: elevator.inspection_technician_id ?? "",
      last_op_date: elevator.last_op_date ?? "",
      op_interval_months: String(elevator.op_interval_months ?? 3),
      last_oz_date: elevator.last_oz_date ?? "",
      oz_interval_months: String(elevator.oz_interval_months ?? 36),
      last_ip_date: elevator.last_ip_date ?? "",
      ip_interval_years: String(elevator.ip_interval_years ?? 6),
    });

    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateForm<K extends keyof ElevatorForm>(
    key: K,
    value: ElevatorForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function numberOrNull(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberOrDefault(value: string, fallback: number) {
    const parsed = numberOrNull(value);
    return parsed ?? fallback;
  }

  async function saveElevator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageElevators) {
      setMessage("Nemáš oprávnění přidávat nebo upravovat výtahy.");
      setSuccessMessage("");
      return;
    }

    const label = form.label.trim();
    const address = form.address.trim();

    if (!label) {
      setMessage("Vyplň označení výtahu.");
      setSuccessMessage("");
      return;
    }

    if (!address) {
      setMessage("Vyplň adresu výtahu.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Ukládám výtah...");

    const supabase = createClient();

    const payload = {
      label,
      address,
      region_id: form.region_id || null,
      serial_number: form.serial_number.trim() || null,
      year_built: numberOrNull(form.year_built),
      elevator_type: form.elevator_type.trim() || null,
      pr_number: form.pr_number.trim() || null,
      pl_number: form.pl_number.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      capacity: form.capacity.trim() || null,
      stations_count: numberOrNull(form.stations_count),
      note: form.note.trim() || null,
      status: form.status,
      ...(canViewElevatorContacts
        ? {
            contact_company: form.contact_company.trim() || null,
            contact_manager: form.contact_manager.trim() || null,
            contact_phone: form.contact_phone.trim() || null,
            contact_email: form.contact_email.trim() || null,
          }
        : {}),
      inspection_technician_id: form.inspection_technician_id || null,
      last_op_date: form.last_op_date || null,
      op_interval_months: numberOrDefault(form.op_interval_months, 3),
      last_oz_date: form.last_oz_date || null,
      oz_interval_months: numberOrDefault(form.oz_interval_months, 36),
      last_ip_date: form.last_ip_date || null,
      ip_interval_years: numberOrDefault(form.ip_interval_years, 6),
      updated_at: new Date().toISOString(),
    };

    if (form.id) {
      const { data, error } = await supabase
        .from("elevators")
        .update(payload)
        .eq("id", form.id)
        .select("id, label, address")
        .single();

      setSaving(false);

      if (error) {
        setSuccessMessage("");
        setMessage(`Chyba při úpravě výtahu: ${error.message}`);
        return;
      }

      setSuccessMessage(`Výtah upraven: ${data?.label ?? label}`);
    } else {
      const { data, error } = await supabase
        .from("elevators")
        .insert(payload)
        .select("id, label, address")
        .single();

      setSaving(false);

      if (error) {
        setSuccessMessage("");
        setMessage(`Chyba při uložení výtahu: ${error.message}`);
        return;
      }

      setSuccessMessage(`Výtah uložen: ${data?.label ?? label}`);
    }

    setShowForm(false);
    setForm(emptyForm);
    await loadData();
  }

  async function deleteElevator(elevator: Elevator) {
    if (!canDeleteElevators) {
      setMessage("Mazat výtahy může jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu chceš smazat výtah "${elevator.label}" na adrese "${elevator.address}"? Tahle akce nejde vrátit.`
    );

    if (!confirmed) return;

    setDeletingElevatorId(elevator.id);
    setMessage("");
    setSuccessMessage("Mažu výtah...");

    const supabase = createClient();

    const { error } = await supabase
      .from("elevators")
      .delete()
      .eq("id", elevator.id);

    setDeletingElevatorId(null);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při mazání výtahu: ${error.message}`);
      return;
    }

    if (form.id === elevator.id) {
      setShowForm(false);
      setForm(emptyForm);
    }

    setSuccessMessage(`Výtah smazán: ${elevator.label}`);
    await loadData();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
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
            {getRoleLabel(currentProfile?.role)}
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
            <h1 style={styles.pageTitle}>Výtahy</h1>
            <p style={styles.pageDescription}>
              Databáze výtahů, rajony, technické údaje a revizní termíny
              OP/OZ/IP.
            </p>
          </div>

          {canManageElevators && (
            <button onClick={startCreate} style={styles.primaryButton}>
              + Přidat výtah
            </button>
          )}
        </div>

        {message && <div style={styles.errorBox}>{message}</div>}
        {successMessage && (
          <div style={styles.successBox}>{successMessage}</div>
        )}

        <section style={styles.topGrid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Přehled výtahů</h2>
                <p style={styles.cardDescription}>Aktuální stav databáze</p>
              </div>
            </div>

            <div style={styles.statGrid}>
              <MiniStat
                label="Celkem"
                value={String(elevators.length)}
                description="výtahů v databázi"
              />
              <MiniStat
                label="Aktivní"
                value={String(activeElevatorsCount)}
                description="v provozu"
                tone="green"
              />
              <MiniStat
                label="Vyřazené"
                value={String(inactiveElevatorsCount)}
                description="mimo provoz"
              />
              <MiniStat
                label="Bez rajonu"
                value={String(elevatorsWithoutRegionCount)}
                description="k doplnění"
                tone={elevatorsWithoutRegionCount > 0 ? "red" : "default"}
              />
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Revize</h2>
                <p style={styles.cardDescription}>Přiřazení revizních techniků</p>
              </div>
            </div>

            <div style={styles.emptyInner}>
              Bez revizního technika:{" "}
              <strong>{elevatorsWithoutInspectionTechnicianCount}</strong>
            </div>
          </div>
        </section>

        {showForm && canManageElevators && (
          <form onSubmit={saveElevator} style={styles.card}>
            <div style={styles.formTop}>
              <div>
                <h2 style={styles.cardTitle}>
                  {form.id ? "Upravit výtah" : "Přidat výtah"}
                </h2>
                <p style={styles.cardDescription}>
                  Základní údaje, technické parametry, revize
                  {canViewElevatorContacts ? " a kontakty." : "."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setMessage("");
                  setSuccessMessage("");
                }}
                style={styles.secondaryButton}
              >
                Zavřít
              </button>
            </div>

            <FormSection title="Základní údaje">
              <Field label="Označení výtahu">
                <input
                  value={form.label}
                  onChange={(event) => updateForm("label", event.target.value)}
                  style={styles.input}
                  placeholder="Např. 523 — Peškova"
                />
              </Field>

              <Field label="Adresa">
                <input
                  value={form.address}
                  onChange={(event) =>
                    updateForm("address", event.target.value)
                  }
                  style={styles.input}
                  placeholder="Ulice 123, Praha"
                />
              </Field>

              <Field label="Rajon">
                <select
                  value={form.region_id}
                  onChange={(event) =>
                    updateForm("region_id", event.target.value)
                  }
                  style={styles.input}
                >
                  <option value="">Bez rajonu</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Stav">
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm("status", event.target.value as ElevatorStatus)
                  }
                  style={styles.input}
                >
                  <option value="aktivni">Aktivní</option>
                  <option value="vyrazeny">Vyřazený</option>
                </select>
              </Field>
            </FormSection>

            <FormSection title="Technické údaje">
              <Field label="Výrobní číslo">
                <input
                  value={form.serial_number}
                  onChange={(event) =>
                    updateForm("serial_number", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Rok výroby">
                <input
                  value={form.year_built}
                  onChange={(event) =>
                    updateForm("year_built", event.target.value)
                  }
                  style={styles.input}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Typ">
                <input
                  value={form.elevator_type}
                  onChange={(event) =>
                    updateForm("elevator_type", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Výrobce">
                <input
                  value={form.manufacturer}
                  onChange={(event) =>
                    updateForm("manufacturer", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="PR číslo">
                <input
                  value={form.pr_number}
                  onChange={(event) =>
                    updateForm("pr_number", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="PL číslo">
                <input
                  value={form.pl_number}
                  onChange={(event) =>
                    updateForm("pl_number", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Nosnost">
                <input
                  value={form.capacity}
                  onChange={(event) =>
                    updateForm("capacity", event.target.value)
                  }
                  style={styles.input}
                  placeholder="Např. 630 kg"
                />
              </Field>

              <Field label="Počet stanic">
                <input
                  value={form.stations_count}
                  onChange={(event) =>
                    updateForm("stations_count", event.target.value)
                  }
                  style={styles.input}
                  inputMode="numeric"
                />
              </Field>
            </FormSection>

            {canViewElevatorContacts && (
              <FormSection title="Kontakt">
                <Field label="Firma / SVJ">
                  <input
                    value={form.contact_company}
                    onChange={(event) =>
                      updateForm("contact_company", event.target.value)
                    }
                    style={styles.input}
                  />
                </Field>

                <Field label="Správce">
                  <input
                    value={form.contact_manager}
                    onChange={(event) =>
                      updateForm("contact_manager", event.target.value)
                    }
                    style={styles.input}
                  />
                </Field>

                <Field label="Telefon">
                  <input
                    value={form.contact_phone}
                    onChange={(event) =>
                      updateForm("contact_phone", event.target.value)
                    }
                    style={styles.input}
                  />
                </Field>

                <Field label="E-mail">
                  <input
                    value={form.contact_email}
                    onChange={(event) =>
                      updateForm("contact_email", event.target.value)
                    }
                    style={styles.input}
                  />
                </Field>
              </FormSection>
            )}

            <FormSection title="Revize OP/OZ/IP">
              <Field label="Revizní technik">
                <select
                  value={form.inspection_technician_id}
                  onChange={(event) =>
                    updateForm("inspection_technician_id", event.target.value)
                  }
                  style={styles.input}
                >
                  <option value="">Nepřiřazen</option>
                  {inspectionTechnicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.full_name || technician.email}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Poslední OP">
                <input
                  type="date"
                  value={form.last_op_date}
                  onChange={(event) =>
                    updateForm("last_op_date", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Interval OP v měsících">
                <input
                  value={form.op_interval_months}
                  onChange={(event) =>
                    updateForm("op_interval_months", event.target.value)
                  }
                  style={styles.input}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Poslední OZ">
                <input
                  type="date"
                  value={form.last_oz_date}
                  onChange={(event) =>
                    updateForm("last_oz_date", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Interval OZ v měsících">
                <input
                  value={form.oz_interval_months}
                  onChange={(event) =>
                    updateForm("oz_interval_months", event.target.value)
                  }
                  style={styles.input}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Poslední IP">
                <input
                  type="date"
                  value={form.last_ip_date}
                  onChange={(event) =>
                    updateForm("last_ip_date", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Interval IP v letech">
                <input
                  value={form.ip_interval_years}
                  onChange={(event) =>
                    updateForm("ip_interval_years", event.target.value)
                  }
                  style={styles.input}
                  inputMode="numeric"
                />
              </Field>
            </FormSection>

            <Field label="Poznámka">
              <textarea
                value={form.note}
                onChange={(event) => updateForm("note", event.target.value)}
                style={{
                  ...styles.input,
                  minHeight: 96,
                  resize: "vertical",
                }}
              />
            </Field>

            <div style={styles.actions}>
              <button disabled={saving} type="submit" style={styles.saveButton}>
                {saving ? "Ukládám..." : "Uložit výtah"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setMessage("");
                  setSuccessMessage("");
                }}
                style={styles.secondaryButton}
              >
                Zrušit
              </button>
            </div>
          </form>
        )}

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Seznam výtahů</h2>
              <p style={styles.cardDescription}>
                Zobrazeno {filteredElevators.length} z {elevators.length}{" "}
                výtahů.
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
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všechny stavy</option>
              <option value="aktivni">Aktivní</option>
              <option value="vyrazeny">Vyřazené</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.emptyInner}>Načítám výtahy...</div>
          ) : (
            <div style={styles.elevatorList}>
              {filteredElevators.length === 0 && (
                <div style={styles.emptyInner}>
                  Zatím tu není žádný výtah podle vybraných filtrů.
                </div>
              )}

              {filteredElevators.map((elevator) => {
                const isDeleting = deletingElevatorId === elevator.id;

                return (
                  <article key={elevator.id} style={styles.elevatorCard}>
                    <div style={styles.elevatorTop}>
                      <div>
                        <div style={styles.titleRow}>
                          <h3 style={styles.elevatorTitle}>{elevator.label}</h3>
                          <StatusPill status={elevator.status} />
                        </div>

                        <p style={styles.elevatorAddress}>{elevator.address}</p>
                      </div>

                      {(canManageElevators || canDeleteElevators) && (
                        <div style={styles.elevatorActions}>
                          {canManageElevators && (
                            <button
                              onClick={() => startEdit(elevator)}
                              style={styles.editButton}
                            >
                              Upravit
                            </button>
                          )}

                          {canDeleteElevators && (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => deleteElevator(elevator)}
                              style={{
                                ...styles.deleteButton,
                                opacity: isDeleting ? 0.7 : 1,
                              }}
                            >
                              {isDeleting ? "Mažu..." : "Smazat"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={styles.pillRow}>
                      <span style={styles.pill}>
                        Rajon: {getRegionName(elevator.region_id)}
                      </span>
                      <span style={styles.pill}>
                        Revize:{" "}
                        {getInspectionTechnicianName(
                          elevator.inspection_technician_id
                        )}
                      </span>
                    </div>

                    <div style={styles.detailGrid}>
                      <Detail label="PR" value={elevator.pr_number || "—"} />
                      <Detail label="PL" value={elevator.pl_number || "—"} />
                      <Detail
                        label="Výr. číslo"
                        value={elevator.serial_number || "—"}
                      />
                      <Detail
                        label="Výrobce"
                        value={elevator.manufacturer || "—"}
                      />
                      <Detail label="Typ" value={elevator.elevator_type || "—"} />
                      <Detail label="Nosnost" value={elevator.capacity || "—"} />
                    </div>

                    <div style={styles.revisionBox}>
                      <RevisionLine
                        label="OP"
                        lastDate={elevator.last_op_date}
                        interval={`${elevator.op_interval_months} měs.`}
                      />
                      <RevisionLine
                        label="OZ"
                        lastDate={elevator.last_oz_date}
                        interval={`${elevator.oz_interval_months} měs.`}
                      />
                      <RevisionLine
                        label="IP"
                        lastDate={elevator.last_ip_date}
                        interval={`${elevator.ip_interval_years} let`}
                      />
                    </div>

                    {canViewElevatorContacts &&
                      (elevator.contact_company ||
                        elevator.contact_manager ||
                        elevator.contact_phone ||
                        elevator.contact_email) && (
                        <div style={styles.noteBox}>
                          <strong>Kontakt: </strong>
                          {elevator.contact_company || "—"}
                          {elevator.contact_manager
                            ? ` · ${elevator.contact_manager}`
                            : ""}
                          {elevator.contact_phone
                            ? ` · ${elevator.contact_phone}`
                            : ""}
                          {elevator.contact_email
                            ? ` · ${elevator.contact_email}`
                            : ""}
                        </div>
                      )}

                    {elevator.note && (
                      <div style={styles.noteBox}>
                        <strong>Poznámka: </strong>
                        {elevator.note}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
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
  tone?: "default" | "green" | "red";
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

  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div style={valueStyle}>{value}</div>
      <div style={styles.statDescription}>{description}</div>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 style={styles.formSectionTitle}>{title}</h3>
      <div style={styles.formGrid}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: ElevatorStatus }) {
  if (status === "aktivni") {
    return <span style={styles.statusActive}>Aktivní</span>;
  }

  return <span style={styles.statusInactive}>Vyřazený</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
    </div>
  );
}

function RevisionLine({
  label,
  lastDate,
  interval,
}: {
  label: string;
  lastDate: string | null;
  interval: string;
}) {
  return (
    <div style={styles.revisionLine}>
      <span style={styles.revisionBadge}>{label}</span>
      <span>Poslední: {lastDate || "—"}</span>
      <span>Interval: {interval}</span>
    </div>
  );
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

  primaryButton: {
    background: "#2563eb",
    color: "white",
    border: 0,
    borderRadius: 15,
    padding: "14px 20px",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 18px 40px rgba(37,99,235,0.22)",
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

  saveButton: {
    background: "#2563eb",
    color: "white",
    border: 0,
    borderRadius: 12,
    padding: "12px 17px",
    fontWeight: 950,
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

  formTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 18,
  },

  formSectionTitle: {
    margin: "18px 0 12px",
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: 950,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },

  fieldLabel: {
    color: "#cbd5e1",
    fontWeight: 800,
    fontSize: 14,
    marginBottom: 7,
  },

  input: {
    width: "100%",
    background: "#020617",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 12,
    outline: "none",
  },

  actions: {
    display: "flex",
    gap: 12,
    marginTop: 18,
    flexWrap: "wrap",
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 220px 180px",
    gap: 12,
    marginBottom: 18,
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

  elevatorList: {
    display: "grid",
    gap: 12,
  },

  elevatorCard: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 17,
    padding: 17,
  },

  elevatorTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  elevatorTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 950,
  },

  elevatorAddress: {
    color: "#cbd5e1",
    margin: "7px 0 0",
  },

  elevatorActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  editButton: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#f8fafc",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  deleteButton: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  statusActive: {
    display: "inline-flex",
    background: "#052e16",
    border: "1px solid #166534",
    color: "#bbf7d0",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 950,
  },

  statusInactive: {
    display: "inline-flex",
    background: "#1e293b",
    border: "1px solid #475569",
    color: "#cbd5e1",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 950,
  },

  pillRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 13,
  },

  pill: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    color: "#cbd5e1",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 800,
  },

  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginTop: 14,
  },

  detailItem: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 11,
  },

  detailLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },

  detailValue: {
    color: "#e2e8f0",
    fontWeight: 850,
    marginTop: 5,
  },

  revisionBox: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 8,
    marginTop: 14,
  },

  revisionLine: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#cbd5e1",
    fontSize: 14,
  },

  revisionBadge: {
    background: "#020617",
    border: "1px solid #334155",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 950,
  },

  noteBox: {
    marginTop: 12,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: 12,
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
};