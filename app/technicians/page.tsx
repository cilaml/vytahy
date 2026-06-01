"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileRole =
  | "admin"
  | "vedouci_technik"
  | "technik"
  | "sekretariat"
  | "servis";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: ProfileRole;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type Region = {
  id: string;
  name: string;
  active: boolean;
};

type ProfileRegion = {
  id: string;
  profile_id: string;
  region_id: string;
};

type NewUserForm = {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: ProfileRole;
  primary_region_id: string;
  can_do_inspections: boolean;
  active: boolean;
};

const roleLabels: Record<ProfileRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const emptyNewUserForm: NewUserForm = {
  email: "",
  password: "",
  full_name: "",
  phone: "",
  role: "technik",
  primary_region_id: "",
  can_do_inspections: false,
  active: true,
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy" },
  { href: "/service", label: "Servis" },
  { href: "/elevators", label: "Výtahy" },
  { href: "/technicians", label: "Technici", active: true },
  { href: "/inspections", label: "Revize" },
  { href: "/regions", label: "Rajony" },
];

export default function TechniciansPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUserForm, setNewUserForm] =
    useState<NewUserForm>(emptyNewUserForm);
  const [newUserSecondaryRegionIds, setNewUserSecondaryRegionIds] = useState<
    string[]
  >([]);

  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editingSecondaryRegionIds, setEditingSecondaryRegionIds] = useState<
    string[]
  >([]);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isAdmin = currentProfile?.role === "admin";

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  const activeProfilesCount = useMemo(() => {
    return profiles.filter((profile) => profile.active).length;
  }, [profiles]);

  const inactiveProfilesCount = useMemo(() => {
    return profiles.filter((profile) => !profile.active).length;
  }, [profiles]);

  const inspectionProfilesCount = useMemo(() => {
    return profiles.filter((profile) => profile.can_do_inspections).length;
  }, [profiles]);

  const withoutPrimaryRegionCount = useMemo(() => {
    return profiles.filter((profile) => !profile.primary_region_id).length;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const text = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesRole = roleFilter ? profile.role === roleFilter : true;

      const matchesRegion = regionFilter
        ? profile.primary_region_id === regionFilter ||
          profileRegions.some(
            (item) =>
              item.profile_id === profile.id && item.region_id === regionFilter
          )
        : true;

      const matchesActive =
        activeFilter === "active"
          ? profile.active
          : activeFilter === "inactive"
            ? !profile.active
            : true;

      const searchable = [
        profile.full_name,
        profile.email,
        profile.phone,
        roleLabels[profile.role],
        getRegionName(profile.primary_region_id),
        getSecondaryRegionNames(profile.id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = text ? searchable.includes(text) : true;

      return matchesRole && matchesRegion && matchesActive && matchesSearch;
    });
  }, [profiles, search, roleFilter, regionFilter, activeFilter, profileRegions]);

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    const region = regions.find((item) => item.id === regionId);
    return region?.name ?? "Neznámý rajon";
  }

  function getSecondaryRegionNames(profileId: string) {
    const regionIds = profileRegions
      .filter((item) => item.profile_id === profileId)
      .map((item) => item.region_id);

    if (regionIds.length === 0) return "Žádné";

    return regionIds
      .map((regionId) => getRegionName(regionId))
      .filter(Boolean)
      .join(", ");
  }

  async function loadData() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let loadedCurrentProfile: Profile | null = null;

    if (user) {
      const { data: currentProfileData } = await supabase
        .from("profiles")
        .select(
          "id, email, full_name, phone, role, primary_region_id, can_do_inspections, active"
        )
        .eq("id", user.id)
        .maybeSingle();

      loadedCurrentProfile = (currentProfileData ?? null) as Profile | null;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, phone, role, primary_region_id, can_do_inspections, active"
      )
      .order("full_name", { ascending: true });

    if (profilesError) {
      setMessage(`Chyba při načítání techniků: ${profilesError.message}`);
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

    const { data: profileRegionsData, error: profileRegionsError } =
      await supabase
        .from("profile_regions")
        .select("id, profile_id, region_id");

    if (profileRegionsError) {
      setMessage(
        `Chyba při načítání sekundárních rajonů: ${profileRegionsError.message}`
      );
      setLoading(false);
      return;
    }

    setCurrentProfile(loadedCurrentProfile);
    setProfiles((profilesData ?? []) as Profile[]);
    setRegions((regionsData ?? []) as Region[]);
    setProfileRegions((profileRegionsData ?? []) as ProfileRegion[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function startCreateUser() {
    setMessage("");
    setSuccessMessage("");
    setEditingProfile(null);
    setEditingSecondaryRegionIds([]);
    setNewUserForm({
      ...emptyNewUserForm,
      role: isAdmin ? emptyNewUserForm.role : "technik",
    });
    setNewUserSecondaryRegionIds([]);
    setShowCreateForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeCreateUser() {
    setShowCreateForm(false);
    setNewUserForm(emptyNewUserForm);
    setNewUserSecondaryRegionIds([]);
    setMessage("");
    setSuccessMessage("");
  }

  function toggleNewUserSecondaryRegion(regionId: string) {
    setNewUserSecondaryRegionIds((current) => {
      if (current.includes(regionId)) {
        return current.filter((id) => id !== regionId);
      }

      return [...current, regionId];
    });
  }

  async function saveNewUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdminOrLead) {
      setMessage("Nové uživatele může vytvářet jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    const email = newUserForm.email.trim().toLowerCase();
    const password = newUserForm.password.trim();
    const fullName = newUserForm.full_name.trim();
    const phone = newUserForm.phone.trim();
    const roleToCreate: ProfileRole = isAdmin ? newUserForm.role : "technik";

    if (!email) {
      setMessage("Vyplň e-mail nového uživatele.");
      setSuccessMessage("");
      return;
    }

    if (!password || password.length < 6) {
      setMessage("Heslo musí mít alespoň 6 znaků.");
      setSuccessMessage("");
      return;
    }

    if (!fullName) {
      setMessage("Vyplň jméno nového uživatele.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Vytvářím nového uživatele...");

    const supabase = createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setSaving(false);
      setSuccessMessage("");
      setMessage("Nepodařilo se získat přihlašovací token.");
      return;
    }

    const response = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        phone: phone || null,
        role: roleToCreate,
        primary_region_id: newUserForm.primary_region_id || null,
        can_do_inspections: newUserForm.can_do_inspections,
        active: newUserForm.active,
        secondary_region_ids: newUserSecondaryRegionIds.filter(
          (regionId) => regionId !== newUserForm.primary_region_id
        ),
      }),
    });

    const responseText = await response.text();

    let result: { ok?: boolean; error?: string; user_id?: string } = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = {
        error:
          responseText ||
          `Server nevrátil JSON odpověď. HTTP status: ${response.status}`,
      };
    }

    setSaving(false);

    if (!response.ok) {
      setSuccessMessage("");
      setMessage(result.error || "Nepodařilo se vytvořit uživatele.");
      return;
    }

    setShowCreateForm(false);
    setNewUserForm(emptyNewUserForm);
    setNewUserSecondaryRegionIds([]);
    setSuccessMessage(`Uživatel vytvořen: ${fullName}`);
    await loadData();
  }

  function startEditing(profile: Profile) {
    setMessage("");
    setSuccessMessage("");
    setShowCreateForm(false);
    setNewUserForm(emptyNewUserForm);
    setNewUserSecondaryRegionIds([]);
    setEditingProfile(profile);

    const secondaryRegionIds = profileRegions
      .filter((item) => item.profile_id === profile.id)
      .map((item) => item.region_id);

    setEditingSecondaryRegionIds(secondaryRegionIds);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function toggleSecondaryRegion(regionId: string) {
    setEditingSecondaryRegionIds((current) => {
      if (current.includes(regionId)) {
        return current.filter((id) => id !== regionId);
      }

      return [...current, regionId];
    });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingProfile) return;

    const fullName = editingProfile.full_name.trim();

    if (!fullName) {
      setMessage("Jméno technika nesmí být prázdné.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Ukládám technika...");

    const supabase = createClient();

    const profileUpdatePayload = {
      full_name: fullName,
      phone: editingProfile.phone?.trim() || null,
      ...(isAdmin ? { role: editingProfile.role } : {}),
      primary_region_id: editingProfile.primary_region_id || null,
      can_do_inspections: editingProfile.can_do_inspections,
      active: editingProfile.active,
      updated_at: new Date().toISOString(),
    };

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update(profileUpdatePayload)
      .eq("id", editingProfile.id);

    if (profileUpdateError) {
      setSaving(false);
      setSuccessMessage("");
      setMessage(`Chyba při ukládání technika: ${profileUpdateError.message}`);
      return;
    }

    const { error: deleteRegionsError } = await supabase
      .from("profile_regions")
      .delete()
      .eq("profile_id", editingProfile.id);

    if (deleteRegionsError) {
      setSaving(false);
      setSuccessMessage("");
      setMessage(
        `Chyba při mazání starých sekundárních rajonů: ${deleteRegionsError.message}`
      );
      return;
    }

    const cleanSecondaryRegionIds = editingSecondaryRegionIds.filter(
      (regionId) => regionId !== editingProfile.primary_region_id
    );

    if (cleanSecondaryRegionIds.length > 0) {
      const rowsToInsert = cleanSecondaryRegionIds.map((regionId) => ({
        profile_id: editingProfile.id,
        region_id: regionId,
      }));

      const { error: insertRegionsError } = await supabase
        .from("profile_regions")
        .insert(rowsToInsert);

      if (insertRegionsError) {
        setSaving(false);
        setSuccessMessage("");
        setMessage(
          `Chyba při ukládání sekundárních rajonů: ${insertRegionsError.message}`
        );
        return;
      }
    }

    setSaving(false);
    setSuccessMessage(`Technik upraven: ${fullName}`);
    setEditingProfile(null);
    setEditingSecondaryRegionIds([]);
    await loadData();
  }

  async function deleteProfile(profile: Profile) {
    if (!isAdminOrLead) {
      setMessage("Uživatele může mazat jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    if (currentProfile?.id === profile.id) {
      setMessage("Nemůžeš smazat sám sebe.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu smazat uživatele?\n\n${profile.full_name || profile.email}\n${
        profile.email
      }\n\nPokud už má vazby na poruchy, servis nebo zprávy, může být lepší ho jen deaktivovat.`
    );

    if (!confirmed) return;

    setDeletingProfileId(profile.id);
    setMessage("");
    setSuccessMessage("Mažu uživatele...");

    const supabase = createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setDeletingProfileId(null);
      setSuccessMessage("");
      setMessage("Nepodařilo se získat přihlašovací token.");
      return;
    }

    const response = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        profile_id: profile.id,
      }),
    });

    const responseText = await response.text();

    let result: { ok?: boolean; error?: string; deleted_user_id?: string } = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = {
        error:
          responseText ||
          `Server nevrátil JSON odpověď. HTTP status: ${response.status}`,
      };
    }

    setDeletingProfileId(null);

    if (!response.ok) {
      setSuccessMessage("");
      setMessage(
        result.error ||
          `Nepodařilo se smazat uživatele. HTTP status: ${response.status}`
      );
      return;
    }

    if (editingProfile?.id === profile.id) {
      setEditingProfile(null);
      setEditingSecondaryRegionIds([]);
    }

    setSuccessMessage(`Uživatel smazán: ${profile.full_name || profile.email}`);
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
              (currentProfile ? roleLabels[currentProfile.role] : "Uživatel")}
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
            Role: {currentProfile ? roleLabels[currentProfile.role] : "—"}
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
            <h1 style={styles.pageTitle}>Technici</h1>
            <p style={styles.pageDescription}>
              Správa uživatelů, rolí, rajonů a oprávnění k revizím.
            </p>
          </div>

          <div style={styles.topbarActions}>
            {isAdminOrLead && (
              <button onClick={startCreateUser} style={styles.primaryButton}>
                + Přidat uživatele
              </button>
            )}

            <Link href="/regions" style={styles.primaryLinkButton}>
              Správa rajonů
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
                <h2 style={styles.cardTitle}>Přehled techniků</h2>
                <p style={styles.cardDescription}>
                  Aktivita, role, revizní oprávnění a přiřazené rajony.
                </p>
              </div>
            </div>

            <div style={styles.statGrid}>
              <MiniStat
                label="Celkem"
                value={String(profiles.length)}
                description="uživatelů"
              />
              <MiniStat
                label="Aktivní"
                value={String(activeProfilesCount)}
                description="může pracovat"
                tone="green"
              />
              <MiniStat
                label="Neaktivní"
                value={String(inactiveProfilesCount)}
                description="vypnutí uživatelé"
                tone={inactiveProfilesCount > 0 ? "red" : "default"}
              />
              <MiniStat
                label="Revize"
                value={String(inspectionProfilesCount)}
                description="může dělat OP/OZ/IP"
              />
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Rajony</h2>
                <p style={styles.cardDescription}>Primární přiřazení techniků</p>
              </div>
            </div>

            <div style={styles.emptyInner}>
              Bez primárního rajonu:{" "}
              <strong>{withoutPrimaryRegionCount}</strong>
            </div>
          </div>
        </section>

        {showCreateForm && (
          <form onSubmit={saveNewUser} style={styles.card}>
            <div style={styles.formTop}>
              <div>
                <h2 style={styles.cardTitle}>Přidat uživatele</h2>
                <p style={styles.cardDescription}>
                  Vytvoří se účet v Supabase Auth a zároveň profil v aplikaci.
                  {!isAdmin && " Vedoucí technik může vytvořit pouze roli Technik."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateUser}
                style={styles.secondaryButton}
              >
                Zavřít
              </button>
            </div>

            <div style={styles.formGrid}>
              <Field label="E-mail">
                <input
                  value={newUserForm.email}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="technik@email.cz"
                  style={styles.input}
                />
              </Field>

              <Field label="Dočasné heslo">
                <input
                  value={newUserForm.password}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      password: event.target.value,
                    })
                  }
                  placeholder="min. 6 znaků"
                  type="text"
                  style={styles.input}
                />
              </Field>

              <Field label="Jméno">
                <input
                  value={newUserForm.full_name}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      full_name: event.target.value,
                    })
                  }
                  placeholder="Jan Novák"
                  style={styles.input}
                />
              </Field>

              <Field label="Telefon">
                <input
                  value={newUserForm.phone}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      phone: event.target.value,
                    })
                  }
                  placeholder="+420..."
                  style={styles.input}
                />
              </Field>

              <Field label="Role">
                {isAdmin ? (
                  <select
                    value={newUserForm.role}
                    onChange={(event) =>
                      setNewUserForm({
                        ...newUserForm,
                        role: event.target.value as ProfileRole,
                      })
                    }
                    style={styles.input}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value="Technik"
                    disabled
                    style={styles.disabledInput}
                  />
                )}
              </Field>

              <Field label="Primární rajon">
                <select
                  value={newUserForm.primary_region_id}
                  onChange={(event) => {
                    const selectedPrimaryRegionId = event.target.value;

                    setNewUserForm({
                      ...newUserForm,
                      primary_region_id: selectedPrimaryRegionId,
                    });

                    if (selectedPrimaryRegionId) {
                      setNewUserSecondaryRegionIds((current) =>
                        current.filter((id) => id !== selectedPrimaryRegionId)
                      );
                    }
                  }}
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
            </div>

            <div style={styles.checkboxGrid}>
              <label style={styles.bigCheckbox}>
                <input
                  type="checkbox"
                  checked={newUserForm.can_do_inspections}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      can_do_inspections: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Může vykonávat revize</strong>
                  <small>Technik se bude nabízet pro OP/OZ/IP.</small>
                </span>
              </label>

              <label style={styles.bigCheckbox}>
                <input
                  type="checkbox"
                  checked={newUserForm.active}
                  onChange={(event) =>
                    setNewUserForm({
                      ...newUserForm,
                      active: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Aktivní uživatel</strong>
                  <small>Aktivní uživatel může normálně pracovat.</small>
                </span>
              </label>
            </div>

            <div>
              <h3 style={styles.formSectionTitle}>Sekundární rajony</h3>

              {regions.length === 0 ? (
                <div style={styles.emptyInner}>
                  Nejdřív vytvoř alespoň jeden rajon.
                </div>
              ) : (
                <div style={styles.secondaryRegionsBox}>
                  {regions.map((region) => {
                    const isPrimary =
                      newUserForm.primary_region_id === region.id;

                    return (
                      <label
                        key={region.id}
                        style={{
                          ...styles.regionCheckbox,
                          ...(isPrimary ? styles.regionCheckboxDisabled : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={isPrimary}
                          checked={newUserSecondaryRegionIds.includes(
                            region.id
                          )}
                          onChange={() =>
                            toggleNewUserSecondaryRegion(region.id)
                          }
                        />

                        <span>
                          {region.name}
                          {isPrimary ? " — primární rajon" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={styles.actions}>
              <button
                disabled={saving}
                type="submit"
                style={{
                  ...styles.saveButton,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Vytvářím..." : "Vytvořit uživatele"}
              </button>

              <button
                type="button"
                onClick={closeCreateUser}
                style={styles.secondaryButton}
              >
                Zrušit
              </button>
            </div>
          </form>
        )}

        {editingProfile && (
          <form onSubmit={saveProfile} style={styles.card}>
            <div style={styles.formTop}>
              <div>
                <h2 style={styles.cardTitle}>Upravit technika</h2>
                <p style={styles.cardDescription}>
                  Změna jména, telefonu, aktivity, revizí a rajonů.
                  {!isAdmin && " Roli může měnit pouze admin."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingProfile(null);
                  setEditingSecondaryRegionIds([]);
                  setMessage("");
                  setSuccessMessage("");
                }}
                style={styles.secondaryButton}
              >
                Zavřít
              </button>
            </div>

            <div style={styles.formGrid}>
              <Field label="E-mail">
                <input
                  value={editingProfile.email}
                  disabled
                  style={styles.disabledInput}
                />
              </Field>

              <Field label="Jméno">
                <input
                  value={editingProfile.full_name}
                  onChange={(event) =>
                    setEditingProfile({
                      ...editingProfile,
                      full_name: event.target.value,
                    })
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Telefon">
                <input
                  value={editingProfile.phone ?? ""}
                  onChange={(event) =>
                    setEditingProfile({
                      ...editingProfile,
                      phone: event.target.value,
                    })
                  }
                  placeholder="+420..."
                  style={styles.input}
                />
              </Field>

              <Field label="Role">
                {isAdmin ? (
                  <select
                    value={editingProfile.role}
                    onChange={(event) =>
                      setEditingProfile({
                        ...editingProfile,
                        role: event.target.value as ProfileRole,
                      })
                    }
                    style={styles.input}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={roleLabels[editingProfile.role]}
                    disabled
                    style={styles.disabledInput}
                  />
                )}
              </Field>

              <Field label="Primární rajon">
                <select
                  value={editingProfile.primary_region_id ?? ""}
                  onChange={(event) => {
                    const selectedPrimaryRegionId = event.target.value || null;

                    setEditingProfile({
                      ...editingProfile,
                      primary_region_id: selectedPrimaryRegionId,
                    });

                    if (selectedPrimaryRegionId) {
                      setEditingSecondaryRegionIds((current) =>
                        current.filter((id) => id !== selectedPrimaryRegionId)
                      );
                    }
                  }}
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
            </div>

            <div style={styles.checkboxGrid}>
              <label style={styles.bigCheckbox}>
                <input
                  type="checkbox"
                  checked={editingProfile.can_do_inspections}
                  onChange={(event) =>
                    setEditingProfile({
                      ...editingProfile,
                      can_do_inspections: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Může vykonávat revize</strong>
                  <small>Technik se bude nabízet pro OP/OZ/IP.</small>
                </span>
              </label>

              <label style={styles.bigCheckbox}>
                <input
                  type="checkbox"
                  checked={editingProfile.active}
                  onChange={(event) =>
                    setEditingProfile({
                      ...editingProfile,
                      active: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Aktivní uživatel</strong>
                  <small>Neaktivní uživatel zůstane v databázi.</small>
                </span>
              </label>
            </div>

            <div>
              <h3 style={styles.formSectionTitle}>Sekundární rajony</h3>

              {regions.length === 0 ? (
                <div style={styles.emptyInner}>
                  Nejdřív vytvoř alespoň jeden rajon.
                </div>
              ) : (
                <div style={styles.secondaryRegionsBox}>
                  {regions.map((region) => {
                    const isPrimary =
                      editingProfile.primary_region_id === region.id;

                    return (
                      <label
                        key={region.id}
                        style={{
                          ...styles.regionCheckbox,
                          ...(isPrimary ? styles.regionCheckboxDisabled : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={isPrimary}
                          checked={editingSecondaryRegionIds.includes(
                            region.id
                          )}
                          onChange={() => toggleSecondaryRegion(region.id)}
                        />

                        <span>
                          {region.name}
                          {isPrimary ? " — primární rajon" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={styles.actions}>
              <button
                disabled={saving}
                type="submit"
                style={{
                  ...styles.saveButton,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Ukládám..." : "Uložit změny"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingProfile(null);
                  setEditingSecondaryRegionIds([]);
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
              <h2 style={styles.cardTitle}>Seznam techniků</h2>
              <p style={styles.cardDescription}>
                Zobrazeno {filteredProfiles.length} z {profiles.length}{" "}
                uživatelů.
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
              placeholder="Hledat jméno, e-mail, telefon, rajon..."
              style={styles.searchInput}
            />

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všechny role</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

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
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všichni</option>
              <option value="active">Aktivní</option>
              <option value="inactive">Neaktivní</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.emptyInner}>Načítám techniky...</div>
          ) : (
            <div style={styles.profileList}>
              {filteredProfiles.length === 0 && (
                <div style={styles.emptyInner}>
                  Žádný technik neodpovídá vybraným filtrům.
                </div>
              )}

              {filteredProfiles.map((profile) => (
                <article key={profile.id} style={styles.profileCard}>
                  <div style={styles.profileTop}>
                    <div>
                      <div style={styles.titleRow}>
                        <h3 style={styles.profileTitle}>
                          {profile.full_name || profile.email}
                        </h3>

                        <StatusPill active={profile.active} />

                        {profile.can_do_inspections && (
                          <span style={styles.inspectionPill}>Revize</span>
                        )}
                      </div>

                      <p style={styles.profileEmail}>{profile.email}</p>

                      {profile.phone && (
                        <p style={styles.profileMeta}>Tel.: {profile.phone}</p>
                      )}
                    </div>

                    <div style={styles.profileActions}>
                      <button
                        onClick={() => startEditing(profile)}
                        style={styles.editButton}
                      >
                        Upravit
                      </button>

                      {isAdminOrLead && currentProfile?.id !== profile.id && (
                        <button
                          onClick={() => deleteProfile(profile)}
                          disabled={deletingProfileId === profile.id}
                          style={{
                            ...styles.deleteButton,
                            opacity:
                              deletingProfileId === profile.id ? 0.7 : 1,
                          }}
                        >
                          {deletingProfileId === profile.id
                            ? "Mažu..."
                            : "Smazat"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.detailGrid}>
                    <Detail label="Role" value={roleLabels[profile.role]} />
                    <Detail
                      label="Primární rajon"
                      value={getRegionName(profile.primary_region_id)}
                    />
                    <Detail
                      label="Sekundární rajony"
                      value={getSecondaryRegionNames(profile.id)}
                    />
                    <Detail
                      label="Revize"
                      value={profile.can_do_inspections ? "Ano" : "Ne"}
                    />
                  </div>
                </article>
              ))}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </label>
  );
}

function StatusPill({ active }: { active: boolean }) {
  if (active) {
    return <span style={styles.statusActive}>Aktivní</span>;
  }

  return <span style={styles.statusInactive}>Neaktivní</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
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

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },

  formSectionTitle: {
    margin: "18px 0 12px",
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: 950,
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

  disabledInput: {
    width: "100%",
    background: "#0f172a",
    color: "#94a3b8",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 12,
    outline: "none",
  },

  checkboxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    marginTop: 16,
  },

  bigCheckbox: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 15,
    padding: 14,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    color: "#f8fafc",
  },

  secondaryRegionsBox: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 9,
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 15,
    padding: 14,
  },

  regionCheckbox: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 11,
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#cbd5e1",
  },

  regionCheckboxDisabled: {
    color: "#64748b",
    opacity: 0.7,
  },

  actions: {
    display: "flex",
    gap: 12,
    marginTop: 18,
    flexWrap: "wrap",
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 190px 220px 160px",
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

  profileList: {
    display: "grid",
    gap: 12,
  },

  profileCard: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 17,
    padding: 17,
  },

  profileTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 13,
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  profileTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 950,
  },

  profileEmail: {
    color: "#cbd5e1",
    margin: "7px 0 0",
  },

  profileMeta: {
    color: "#94a3b8",
    margin: "5px 0 0",
    fontSize: 14,
  },

  profileActions: {
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
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 950,
  },

  inspectionPill: {
    display: "inline-flex",
    background: "#1e3a8a",
    border: "1px solid #2563eb",
    color: "#dbeafe",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 950,
  },

  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
    lineHeight: 1.4,
  },
};