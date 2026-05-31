"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

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
  manufacturer: string | null;
  status: "aktivni" | "vyrazeny";
};

type ServiceRecordType =
  | "foto_strojovna"
  | "foto_prohluben"
  | "foto_kabina"
  | "poznamka"
  | "mazani_voditek"
  | "mazani_dveri"
  | "cisteni_strojovny"
  | "cisteni_prohlubne"
  | "cisteni_kabiny"
  | "kontrola_osvetleni"
  | "kontrola_dveri"
  | "kontrola_nouzove_komunikace"
  | "jine";

type ServiceRecord = {
  id: string;
  elevator_id: string;
  profile_id: string | null;
  type: ServiceRecordType;
  note: string | null;
  created_at: string;
};

type ServiceForm = {
  type: ServiceRecordType;
  note: string;
};

const serviceTypeLabels: Record<ServiceRecordType, string> = {
  foto_strojovna: "Foto strojovny",
  foto_prohluben: "Foto prohlubně",
  foto_kabina: "Foto kabiny",
  poznamka: "Poznámka",
  mazani_voditek: "Mazání vodítek",
  mazani_dveri: "Mazání dveří",
  cisteni_strojovny: "Čištění strojovny",
  cisteni_prohlubne: "Čištění prohlubně",
  cisteni_kabiny: "Čištění kabiny",
  kontrola_osvetleni: "Kontrola osvětlení",
  kontrola_dveri: "Kontrola dveří",
  kontrola_nouzove_komunikace: "Kontrola nouzové komunikace",
  jine: "Jiné",
};

const serviceTypes: ServiceRecordType[] = [
  "poznamka",
  "mazani_voditek",
  "mazani_dveri",
  "cisteni_strojovny",
  "cisteni_prohlubne",
  "cisteni_kabiny",
  "kontrola_osvetleni",
  "kontrola_dveri",
  "kontrola_nouzove_komunikace",
  "jine",
];

const emptyServiceForm: ServiceForm = {
  type: "poznamka",
  note: "",
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy" },
  { href: "/service", label: "Servis", active: true },
  { href: "/elevators", label: "Výtahy" },
  { href: "/technicians", label: "Technici" },
  { href: "/inspections", label: "Revize" },
  { href: "/regions", label: "Rajony" },
];

export default function ServicePage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);

  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);

  const [selectedElevatorId, setSelectedElevatorId] = useState<string | null>(
    null
  );

  const [form, setForm] = useState<ServiceForm>(emptyServiceForm);

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ServiceForm>(emptyServiceForm);
  const [updatingRecordId, setUpdatingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  const selectedElevator = useMemo(() => {
    if (!selectedElevatorId) return null;
    return elevators.find((item) => item.id === selectedElevatorId) ?? null;
  }, [selectedElevatorId, elevators]);

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";
    return regions.find((item) => item.id === regionId)?.name ?? "Neznámý rajon";
  }

  function getProfileName(profileId: string | null) {
    if (!profileId) return "Neznámý uživatel";
    return (
      profiles.find((item) => item.id === profileId)?.full_name ??
      "Neznámý uživatel"
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

    if (currentProfile.primary_region_id === elevator.region_id) {
      return true;
    }

    return profileRegions.some(
      (item) =>
        item.profile_id === currentProfile.id &&
        item.region_id === elevator.region_id
    );
  }

  function canCurrentUserModifyRecord(record: ServiceRecord) {
    if (!currentProfile) return false;
    if (isAdminOrLead) return true;
    return record.profile_id === currentProfile.id;
  }

  const visibleElevators = useMemo(() => {
    return elevators.filter((elevator) => canCurrentUserSeeElevator(elevator));
  }, [elevators, currentProfile, profileRegions]);

  const filteredElevators = useMemo(() => {
    const text = search.trim().toLowerCase();

    return visibleElevators.filter((elevator) => {
      const matchesRegion = regionFilter
        ? elevator.region_id === regionFilter
        : true;

      const searchable = [
        elevator.address,
        elevator.label,
        elevator.serial_number,
        elevator.pr_number,
        elevator.pl_number,
        elevator.manufacturer,
        getRegionName(elevator.region_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = text ? searchable.includes(text) : true;

      return matchesRegion && matchesSearch;
    });
  }, [visibleElevators, search, regionFilter, regions]);

  const selectedElevatorRecords = useMemo(() => {
    if (!selectedElevatorId) return [];

    return serviceRecords
      .filter((record) => record.elevator_id === selectedElevatorId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [selectedElevatorId, serviceRecords]);

  const myRecordsCount = useMemo(() => {
    if (!currentProfile) return 0;

    return serviceRecords.filter(
      (record) => record.profile_id === currentProfile.id
    ).length;
  }, [serviceRecords, currentProfile]);

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
        .select("id, email, full_name, role, primary_region_id, active")
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
      serviceRecordsResult,
    ] = await Promise.all([
      supabase
        .from("elevators")
        .select(
          "id, label, address, region_id, serial_number, pr_number, pl_number, manufacturer, status"
        )
        .order("address", { ascending: true }),

      supabase
        .from("regions")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase
        .from("profiles")
        .select("id, email, full_name, role, primary_region_id, active")
        .order("full_name", { ascending: true }),

      supabase.from("profile_regions").select("id, profile_id, region_id"),

      supabase
        .from("service_records")
        .select("id, elevator_id, profile_id, type, note, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const error =
      elevatorsResult.error ||
      regionsResult.error ||
      profilesResult.error ||
      profileRegionsResult.error ||
      serviceRecordsResult.error;

    if (error) {
      setMessage(`Chyba při načítání servisu: ${error.message}`);
      setLoading(false);
      return;
    }

    setCurrentProfile(currentProfileData as Profile);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setRegions((regionsResult.data ?? []) as Region[]);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setProfileRegions((profileRegionsResult.data ?? []) as ProfileRegion[]);
    setServiceRecords((serviceRecordsResult.data ?? []) as ServiceRecord[]);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveServiceRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedElevator) {
      setMessage("Vyber výtah.");
      setSuccessMessage("");
      return;
    }

    if (!currentProfile) {
      setMessage("Nejsi přihlášený.");
      setSuccessMessage("");
      return;
    }

    const note = form.note.trim();

    if (form.type === "poznamka" && !note) {
      setMessage("U poznámky vyplň text.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Ukládám servisní záznam...");

    const supabase = createClient();

    const { error } = await supabase.from("service_records").insert({
      elevator_id: selectedElevator.id,
      profile_id: currentProfile.id,
      type: form.type,
      note: note || null,
    });

    setSaving(false);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při uložení servisního záznamu: ${error.message}`);
      return;
    }

    setForm(emptyServiceForm);
    setSuccessMessage("Servisní záznam byl uložen.");
    await loadData();
  }

  function quickSetType(type: ServiceRecordType) {
    setForm((current) => ({
      ...current,
      type,
    }));
  }

  function startEditRecord(record: ServiceRecord) {
    setMessage("");
    setSuccessMessage("");
    setEditingRecordId(record.id);
    setEditForm({
      type: record.type,
      note: record.note ?? "",
    });
  }

  function cancelEditRecord() {
    setEditingRecordId(null);
    setEditForm(emptyServiceForm);
  }

  async function updateServiceRecord(record: ServiceRecord) {
    if (!canCurrentUserModifyRecord(record)) {
      setMessage("Tenhle servisní záznam nemáš oprávnění upravit.");
      setSuccessMessage("");
      return;
    }

    const note = editForm.note.trim();

    if (editForm.type === "poznamka" && !note) {
      setMessage("U poznámky vyplň text.");
      setSuccessMessage("");
      return;
    }

    setUpdatingRecordId(record.id);
    setMessage("");
    setSuccessMessage("Ukládám úpravu servisního záznamu...");

    const supabase = createClient();

    const { error } = await supabase
      .from("service_records")
      .update({
        type: editForm.type,
        note: note || null,
      })
      .eq("id", record.id);

    setUpdatingRecordId(null);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při úpravě servisního záznamu: ${error.message}`);
      return;
    }

    setEditingRecordId(null);
    setEditForm(emptyServiceForm);
    setSuccessMessage("Servisní záznam byl upraven.");
    await loadData();
  }

  async function deleteServiceRecord(record: ServiceRecord) {
    if (!canCurrentUserModifyRecord(record)) {
      setMessage("Tenhle servisní záznam nemáš oprávnění smazat.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      "Opravdu chceš smazat tenhle servisní záznam? Tahle akce nejde vrátit."
    );

    if (!confirmed) return;

    setDeletingRecordId(record.id);
    setMessage("");
    setSuccessMessage("Mažu servisní záznam...");

    const supabase = createClient();

    const { error } = await supabase
      .from("service_records")
      .delete()
      .eq("id", record.id);

    setDeletingRecordId(null);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při mazání servisního záznamu: ${error.message}`);
      return;
    }

    if (editingRecordId === record.id) {
      setEditingRecordId(null);
      setEditForm(emptyServiceForm);
    }

    setSuccessMessage("Servisní záznam byl smazán.");
    await loadData();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="app-layout">
        <StyleBlock />

        <aside className="sidebar">
          <div className="brand-card">
            <div className="brand-kicker">SERVISNÍ SYSTÉM</div>
            <div className="brand-title">Výtahy Servis</div>
            <div className="brand-subtitle">
              Databáze, poruchy, servis a revize
            </div>
          </div>
        </aside>

        <section className="content">
          <div className="empty-box">Načítám servis...</div>
        </section>
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
          <div className="brand-subtitle">
            Databáze, poruchy, servis a revize
          </div>
        </div>

        <div className="side-label">PŘIHLÁŠENÝ UŽIVATEL</div>

        <div className="user-select">
          {(currentProfile?.full_name || currentProfile?.email || "Uživatel") +
            " — " +
            getRoleLabel(currentProfile?.role)}
        </div>

        <nav className="nav">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? "nav-link active" : "nav-link"}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="profile-card">
          <strong>{currentProfile?.full_name || "Uživatel"}</strong>
          <span>{getRoleLabel(currentProfile?.role)}</span>
          <span>
            Rajon: {getRegionName(currentProfile?.primary_region_id ?? null)}
          </span>
          <span>Dostupné výtahy: {visibleElevators.length}</span>
        </div>

        <div className="sidebar-spacer" />

        <button
          onClick={signOut}
          className="logout-button desktop-logout-button"
        >
          Odhlásit
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Servis</h1>
            <p>Servisní deník výtahů, mazání, čištění, kontroly a poznámky.</p>
          </div>

          <Link href="/elevators" className="primary-link-button">
            Otevřít databázi výtahů
          </Link>
        </header>

        {message && <div className="error-box">{message}</div>}
        {successMessage && <div className="success-box">{successMessage}</div>}

        <section className="top-grid">
          <section className="card">
            <div className="card-header">
              <h2>Moje servisní práce</h2>
              <p>Přehled výtahů podle tvých práv a rajonů</p>
            </div>

            <div className="stat-grid">
              <MiniStat
                label="Dostupné výtahy"
                value={String(visibleElevators.length)}
                description="podle práv"
              />
              <MiniStat
                label="Záznamy celkem"
                value={String(serviceRecords.length)}
                description="v servisním deníku"
              />
              <MiniStat
                label="Moje záznamy"
                value={String(myRecordsCount)}
                description="provedené tebou"
                tone="green"
              />
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Vybraný výtah</h2>
              <p>Záznam bude uložen k aktuálně vybranému výtahu</p>
            </div>

            {!selectedElevator ? (
              <div className="empty-box">Zatím není vybraný žádný výtah.</div>
            ) : (
              <div className="selected-mini-card">
                <strong>{selectedElevator.address}</strong>
                <span>{selectedElevator.label}</span>
                <small>Rajon: {getRegionName(selectedElevator.region_id)}</small>
              </div>
            )}
          </section>
        </section>

        <section className="service-grid">
          <aside className="card">
            <div className="card-header">
              <h2>Výtahy</h2>
              <p>Vyber výtah, ke kterému chceš zapsat práci</p>
            </div>

            <div className="filters">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hledat adresu, PR, PL, výrobní číslo..."
                className="input"
              />

              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                className="input"
              >
                <option value="">Všechny moje rajony</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="elevator-list">
              {filteredElevators.length === 0 && (
                <div className="empty-box">Žádné výtahy pro vybraný filtr.</div>
              )}

              {filteredElevators.map((elevator) => {
                const selected = elevator.id === selectedElevatorId;

                return (
                  <button
                    key={elevator.id}
                    type="button"
                    onClick={() => {
                      setSelectedElevatorId(elevator.id);
                      setEditingRecordId(null);
                      setEditForm(emptyServiceForm);
                      setMessage("");
                      setSuccessMessage("");
                    }}
                    className={
                      selected ? "elevator-button active" : "elevator-button"
                    }
                  >
                    <strong>{elevator.address}</strong>
                    <span>{elevator.label}</span>
                    <small>Rajon: {getRegionName(elevator.region_id)}</small>
                    <small>
                      PR: {elevator.pr_number || "—"} · PL:{" "}
                      {elevator.pl_number || "—"} · Výr. č.:{" "}
                      {elevator.serial_number || "—"}
                    </small>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card">
            {!selectedElevator ? (
              <div className="empty-box">
                Vyber výtah, ke kterému chceš přidat servisní záznam.
              </div>
            ) : (
              <>
                <div className="selected-header">
                  <div>
                    <h2>{selectedElevator.address}</h2>
                    <div className="selected-subtitle">
                      {selectedElevator.label}
                    </div>
                    <div className="selected-meta">
                      Rajon: {getRegionName(selectedElevator.region_id)}
                    </div>
                    <div className="selected-meta">
                      PR: {selectedElevator.pr_number || "—"} · PL:{" "}
                      {selectedElevator.pl_number || "—"} · Výr. č.:{" "}
                      {selectedElevator.serial_number || "—"}
                    </div>
                  </div>

                  <Link href="/elevators" className="secondary-link-button">
                    Databáze výtahů →
                  </Link>
                </div>

                <form onSubmit={saveServiceRecord} className="inner-card">
                  <h3>Přidat servisní záznam</h3>

                  <div className="quick-types">
                    {serviceTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => quickSetType(type)}
                        className={
                          form.type === type
                            ? "quick-type-button active"
                            : "quick-type-button"
                        }
                      >
                        {serviceTypeLabels[type]}
                      </button>
                    ))}
                  </div>

                  <label className="field">
                    <span>Typ záznamu</span>
                    <select
                      value={form.type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          type: event.target.value as ServiceRecordType,
                        }))
                      }
                      className="input"
                    >
                      {serviceTypes.map((type) => (
                        <option key={type} value={type}>
                          {serviceTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Poznámka</span>
                    <textarea
                      value={form.note}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Volitelná poznámka k provedené práci..."
                      className="textarea"
                    />
                  </label>

                  <button
                    disabled={saving}
                    type="submit"
                    className="save-button"
                  >
                    {saving ? "Ukládám..." : "Uložit servisní záznam"}
                  </button>
                </form>

                <div>
                  <h3 className="archive-title">Archiv servisních prací</h3>

                  <div className="records-list">
                    {selectedElevatorRecords.length === 0 && (
                      <div className="empty-box">
                        Zatím tu nejsou žádné servisní záznamy.
                      </div>
                    )}

                    {selectedElevatorRecords.map((record) => {
                      const canModify = canCurrentUserModifyRecord(record);
                      const isEditing = editingRecordId === record.id;
                      const isUpdating = updatingRecordId === record.id;
                      const isDeleting = deletingRecordId === record.id;

                      return (
                        <article key={record.id} className="record-card">
                          <div className="record-top">
                            <strong>{serviceTypeLabels[record.type]}</strong>

                            <span>
                              {new Date(record.created_at).toLocaleString(
                                "cs-CZ"
                              )}
                            </span>
                          </div>

                          <div className="record-author">
                            Provedl: {getProfileName(record.profile_id)}
                          </div>

                          {record.note && !isEditing && (
                            <p className="record-note">{record.note}</p>
                          )}

                          {!record.note && !isEditing && (
                            <p className="record-note muted">Bez poznámky.</p>
                          )}

                          {isEditing && (
                            <div className="edit-record-box">
                              <label className="field">
                                <span>Typ záznamu</span>
                                <select
                                  value={editForm.type}
                                  onChange={(event) =>
                                    setEditForm((current) => ({
                                      ...current,
                                      type: event.target
                                        .value as ServiceRecordType,
                                    }))
                                  }
                                  className="input"
                                >
                                  {serviceTypes.map((type) => (
                                    <option key={type} value={type}>
                                      {serviceTypeLabels[type]}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="field">
                                <span>Poznámka</span>
                                <textarea
                                  value={editForm.note}
                                  onChange={(event) =>
                                    setEditForm((current) => ({
                                      ...current,
                                      note: event.target.value,
                                    }))
                                  }
                                  className="textarea small"
                                />
                              </label>

                              <div className="record-actions">
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => updateServiceRecord(record)}
                                  className="small-primary-button"
                                >
                                  {isUpdating ? "Ukládám..." : "Uložit úpravu"}
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEditRecord}
                                  className="small-secondary-button"
                                >
                                  Zrušit
                                </button>
                              </div>
                            </div>
                          )}

                          {!isEditing && canModify && (
                            <div className="record-actions">
                              <button
                                type="button"
                                onClick={() => startEditRecord(record)}
                                className="small-secondary-button"
                              >
                                Upravit
                              </button>

                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => deleteServiceRecord(record)}
                                className="small-danger-button"
                              >
                                {isDeleting ? "Mažu..." : "Smazat"}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </section>
        </section>

        <button onClick={signOut} className="logout-button mobile-logout-button">
          Odhlásit
        </button>
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
  tone?: "default" | "green";
}) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className={tone === "green" ? "stat-value green" : "stat-value"}>
        {value}
      </div>
      <div className="stat-description">{description}</div>
    </div>
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

      .app-layout {
        min-height: 100vh;
        background: #020617;
        color: #f8fafc;
        display: grid;
        grid-template-columns: 280px 1fr;
      }

      .sidebar {
        background: #020617;
        border-right: 1px solid #1e293b;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }

      .brand-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 18px;
        padding: 18px;
        margin-bottom: 8px;
      }

      .brand-kicker {
        color: #93c5fd;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 10px;
      }

      .brand-title {
        font-size: 23px;
        font-weight: 950;
        margin-bottom: 18px;
      }

      .brand-subtitle {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.5;
      }

      .side-label {
        color: #64748b;
        text-transform: uppercase;
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 8px;
      }

      .user-select {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 13px 14px;
        color: #f8fafc;
        margin-bottom: 4px;
      }

      .nav {
        display: grid;
        gap: 8px;
      }

      .nav-link {
        display: block;
        text-decoration: none;
        background: #0f172a;
        border: 1px solid #1e293b;
        color: #f8fafc;
        border-radius: 12px;
        padding: 14px 15px;
        font-weight: 900;
      }

      .nav-link.active {
        background: #2563eb;
        border-color: #60a5fa;
      }

      .profile-card {
        margin-top: auto;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
        display: grid;
        gap: 5px;
      }

      .profile-card strong {
        color: #f8fafc;
        font-weight: 900;
      }

      .profile-card span {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.6;
      }

      .sidebar-spacer {
        flex: 1;
        min-height: 14px;
      }

      .logout-button {
        background: #991b1b;
        border: 1px solid #7f1d1d;
        color: #fee2e2;
        border-radius: 13px;
        padding: 13px 14px;
        font-weight: 900;
        cursor: pointer;
      }

      .mobile-logout-button {
        display: none;
      }

      .content {
        padding: 34px 38px;
        display: grid;
        gap: 18px;
        align-content: start;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
      }

      .topbar h1 {
        margin: 0;
        font-size: 36px;
        font-weight: 950;
        letter-spacing: -0.03em;
      }

      .topbar p {
        margin: 10px 0 0;
        color: #cbd5e1;
        font-size: 16px;
      }

      .primary-link-button {
        background: #2563eb;
        color: white;
        border: 0;
        border-radius: 15px;
        padding: 14px 20px;
        font-weight: 950;
        font-size: 16px;
        cursor: pointer;
        text-decoration: none;
        box-shadow: 0 18px 40px rgba(37,99,235,0.22);
      }

      .secondary-link-button {
        color: #93c5fd;
        text-decoration: none;
        font-weight: 900;
        white-space: nowrap;
      }

      .error-box {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
        padding: 13px;
        border-radius: 14px;
      }

      .success-box {
        background: #052e16;
        border: 1px solid #166534;
        color: #bbf7d0;
        padding: 13px;
        border-radius: 14px;
      }

      .top-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 18px;
      }

      .service-grid {
        display: grid;
        grid-template-columns: minmax(300px, 430px) 1fr;
        gap: 18px;
        align-items: start;
      }

      .card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 24px;
        padding: 22px;
      }

      .card-header {
        margin-bottom: 16px;
      }

      .card-header h2 {
        margin: 0;
        font-size: 25px;
        font-weight: 950;
        letter-spacing: -0.02em;
      }

      .card-header p {
        color: #93a4bd;
        margin: 5px 0 0;
        font-size: 14px;
      }

      .empty-box {
        background: #020617;
        border: 1px dashed #334155;
        border-radius: 15px;
        padding: 17px;
        color: #cbd5e1;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 12px;
      }

      .stat-box {
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 16px;
        padding: 14px;
      }

      .stat-label {
        color: #94a3b8;
        font-size: 13px;
        font-weight: 900;
      }

      .stat-value {
        margin-top: 6px;
        color: #f8fafc;
        font-size: 30px;
        font-weight: 950;
      }

      .stat-value.green {
        color: #86efac;
      }

      .stat-description {
        margin-top: 3px;
        color: #64748b;
        font-size: 13px;
      }

      .selected-mini-card {
        background: #020617;
        border: 1px solid #334155;
        border-radius: 15px;
        padding: 16px;
        display: grid;
        gap: 5px;
        color: #f8fafc;
      }

      .filters {
        display: grid;
        gap: 10px;
        margin-bottom: 14px;
      }

      .input,
      .textarea {
        width: 100%;
        background: #020617;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 12px;
        outline: none;
      }

      .textarea {
        min-height: 94px;
        resize: vertical;
      }

      .textarea.small {
        min-height: 90px;
      }

      .elevator-list {
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 410px);
        overflow-y: auto;
        padding-right: 4px;
      }

      .elevator-button {
        text-align: left;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid #334155;
        background: #020617;
        color: white;
        cursor: pointer;
        display: grid;
        gap: 5px;
      }

      .elevator-button.active {
        border: 1px solid #60a5fa;
        background: #1d4ed8;
      }

      .selected-header {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }

      .selected-header h2 {
        font-size: 26px;
        font-weight: 950;
        margin: 0 0 6px;
      }

      .selected-subtitle {
        color: #cbd5e1;
        margin-bottom: 5px;
      }

      .selected-meta {
        color: #94a3b8;
        font-size: 14px;
        line-height: 1.5;
      }

      .inner-card {
        background: #020617;
        border: 1px solid #334155;
        border-radius: 18px;
        padding: 16px;
        margin-bottom: 18px;
        display: grid;
        gap: 14px;
      }

      .inner-card h3 {
        font-size: 20px;
        font-weight: 950;
        margin: 0;
      }

      .field {
        display: grid;
        gap: 7px;
      }

      .field span {
        color: #cbd5e1;
        font-weight: 800;
        font-size: 14px;
      }

      .quick-types {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .quick-type-button {
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid #334155;
        background: #020617;
        color: white;
        cursor: pointer;
        font-weight: 800;
      }

      .quick-type-button.active {
        border: 1px solid #60a5fa;
        background: #1d4ed8;
      }

      .save-button {
        padding: 12px 18px;
        border-radius: 12px;
        border: 0;
        background: #2563eb;
        color: white;
        font-weight: 950;
        cursor: pointer;
        justify-self: start;
      }

      .archive-title {
        font-size: 20px;
        font-weight: 950;
        margin: 0 0 12px;
      }

      .records-list {
        display: grid;
        gap: 10px;
      }

      .record-card {
        background: #020617;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
      }

      .record-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
        color: #f8fafc;
      }

      .record-author {
        color: #cbd5e1;
        font-size: 14px;
      }

      .record-note {
        color: #e2e8f0;
        margin-top: 8px;
        margin-bottom: 0;
        line-height: 1.5;
      }

      .record-note.muted {
        color: #64748b;
        font-style: italic;
      }

      .record-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .edit-record-box {
        margin-top: 12px;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 14px;
        padding: 12px;
        display: grid;
        gap: 12px;
      }

      .small-primary-button,
      .small-secondary-button,
      .small-danger-button {
        border-radius: 11px;
        padding: 9px 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .small-primary-button {
        background: #2563eb;
        border: 0;
        color: #ffffff;
      }

      .small-secondary-button {
        background: #1e293b;
        border: 1px solid #334155;
        color: #f8fafc;
      }

      .small-danger-button {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
      }

      @media (max-width: 1100px) {
        .top-grid,
        .service-grid {
          grid-template-columns: 1fr;
        }

        .elevator-list {
          max-height: none;
          overflow-y: visible;
          padding-right: 0;
        }
      }

      @media (max-width: 980px) {
        .app-layout {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: relative;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid #1e293b;
        }

        .profile-card {
          margin-top: 12px;
        }

        .sidebar-spacer {
          display: none;
        }

        .desktop-logout-button {
          display: none;
        }

        .mobile-logout-button {
          display: block;
          min-height: 48px;
          margin-top: 18px;
        }

        .content {
          padding: 18px;
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

        .content {
          padding: 14px;
        }

        .topbar {
          display: grid;
          gap: 14px;
          margin-bottom: 0;
        }

        .topbar h1 {
          font-size: 30px;
          line-height: 1.05;
        }

        .topbar p {
          font-size: 15px;
          line-height: 1.45;
        }

        .primary-link-button {
          width: 100%;
          min-height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
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

        .stat-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .input,
        .textarea {
          min-height: 48px;
          font-size: 16px;
        }

        .textarea {
          min-height: 110px;
        }

        .quick-types {
          display: grid;
          grid-template-columns: 1fr;
        }

        .quick-type-button,
        .save-button,
        .small-primary-button,
        .small-secondary-button,
        .small-danger-button {
          width: 100%;
          min-height: 48px;
        }

        .save-button {
          justify-self: stretch;
        }

        .selected-header {
          display: grid;
        }

        .secondary-link-button {
          white-space: normal;
          min-height: 44px;
          display: flex;
          align-items: center;
        }

        .record-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .record-card {
          padding: 14px;
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

        .card {
          padding: 14px;
        }
      }
    `}</style>
  );
}