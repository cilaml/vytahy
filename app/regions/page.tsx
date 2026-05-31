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
  role: ProfileRole;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type Region = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

const roleLabels: Record<ProfileRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy" },
  { href: "/service", label: "Servis" },
  { href: "/elevators", label: "Výtahy" },
  { href: "/technicians", label: "Technici" },
  { href: "/inspections", label: "Revize" },
  { href: "/regions", label: "Rajony", active: true },
];

export default function RegionsPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [newRegionName, setNewRegionName] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingRegionId, setUpdatingRegionId] = useState<string | null>(null);
  const [deletingRegionId, setDeletingRegionId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const activeRegionsCount = useMemo(() => {
    return regions.filter((region) => region.active).length;
  }, [regions]);

  const inactiveRegionsCount = useMemo(() => {
    return regions.filter((region) => !region.active).length;
  }, [regions]);

  const filteredRegions = useMemo(() => {
    const text = search.trim().toLowerCase();

    return regions.filter((region) => {
      const matchesSearch = text
        ? region.name.toLowerCase().includes(text)
        : true;

      const matchesStatus =
        statusFilter === "active"
          ? region.active
          : statusFilter === "inactive"
            ? !region.active
            : true;

      return matchesSearch && matchesStatus;
    });
  }, [regions, search, statusFilter]);

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    const region = regions.find((item) => item.id === regionId);
    return region?.name ?? "Neznámý rajon";
  }

  function getRoleLabel(role: ProfileRole | undefined) {
    if (!role) return "Uživatel";
    return roleLabels[role] ?? role;
  }

  async function loadRegions() {
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
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .eq("id", user.id)
        .maybeSingle();

      loadedCurrentProfile = (currentProfileData ?? null) as Profile | null;
    }

    const { data, error } = await supabase
      .from("regions")
      .select("id, name, active, created_at")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Chyba při načítání rajonů: ${error.message}`);
      setLoading(false);
      return;
    }

    setCurrentProfile(loadedCurrentProfile);
    setRegions((data ?? []) as Region[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRegions();
  }, []);

  async function addRegion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newRegionName.trim();

    if (!name) {
      setMessage("Zadej název rajonu.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Ukládám rajon...");

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setSuccessMessage("");
      setMessage("Nejsi přihlášený. Přihlas se znovu.");
      return;
    }

    const { error: insertError } = await supabase.from("regions").insert({
      name,
      active: true,
    });

    setSaving(false);

    if (insertError) {
      setSuccessMessage("");
      setMessage(`Chyba při přidání rajonu: ${insertError.message}`);
      return;
    }

    setNewRegionName("");
    setSuccessMessage(`Rajon přidán: ${name}`);
    await loadRegions();
  }

  async function toggleRegion(region: Region) {
    const supabase = createClient();

    setUpdatingRegionId(region.id);
    setMessage("");
    setSuccessMessage(
      region.active ? "Deaktivuji rajon..." : "Aktivuji rajon..."
    );

    const { error: updateError } = await supabase
      .from("regions")
      .update({ active: !region.active })
      .eq("id", region.id);

    setUpdatingRegionId(null);

    if (updateError) {
      setSuccessMessage("");
      setMessage(`Chyba při změně rajonu: ${updateError.message}`);
      return;
    }

    setSuccessMessage(
      region.active
        ? `Rajon deaktivován: ${region.name}`
        : `Rajon aktivován: ${region.name}`
    );

    await loadRegions();
  }

  async function deleteRegion(region: Region) {
    if (!isAdminOrLead) {
      setMessage("Mazat rajony může jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu chceš smazat rajon "${region.name}"? Pokud je rajon použitý u výtahů nebo techniků, databáze může smazání odmítnout.`
    );

    if (!confirmed) return;

    setDeletingRegionId(region.id);
    setMessage("");
    setSuccessMessage("Mažu rajon...");

    const supabase = createClient();

    const { error } = await supabase
      .from("regions")
      .delete()
      .eq("id", region.id);

    setDeletingRegionId(null);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při mazání rajonu: ${error.message}`);
      return;
    }

    setSuccessMessage(`Rajon smazán: ${region.name}`);
    await loadRegions();
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
            <h1 style={styles.pageTitle}>Rajony</h1>
            <p style={styles.pageDescription}>
              Správa rajonů pro výtahy, techniky, poruchy a servis.
            </p>
          </div>

          <Link href="/technicians" style={styles.primaryLinkButton}>
            Přiřadit technikům
          </Link>
        </div>

        {message && <div style={styles.errorBox}>{message}</div>}
        {successMessage && (
          <div style={styles.successBox}>{successMessage}</div>
        )}

        <section style={styles.topGrid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Přehled rajonů</h2>
                <p style={styles.cardDescription}>
                  Rajony se používají u výtahů, techniků, poruch a servisu.
                </p>
              </div>
            </div>

            <div style={styles.statGrid}>
              <MiniStat
                label="Celkem"
                value={String(regions.length)}
                description="rajonů v databázi"
              />
              <MiniStat
                label="Aktivní"
                value={String(activeRegionsCount)}
                description="lze je používat"
                tone="green"
              />
              <MiniStat
                label="Neaktivní"
                value={String(inactiveRegionsCount)}
                description="schované pro nové volby"
                tone={inactiveRegionsCount > 0 ? "red" : "default"}
              />
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Nový rajon</h2>
                <p style={styles.cardDescription}>
                  Přidej vlastní rajon, třeba Praha 4 nebo Střed.
                </p>
              </div>
            </div>

            <form onSubmit={addRegion} style={styles.addForm}>
              <input
                value={newRegionName}
                onChange={(event) => setNewRegionName(event.target.value)}
                placeholder="Např. Praha 4"
                style={styles.input}
              />

              <button
                disabled={saving}
                type="submit"
                style={{
                  ...styles.saveButton,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Ukládám..." : "Přidat rajon"}
              </button>
            </form>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Seznam rajonů</h2>
              <p style={styles.cardDescription}>
                Zobrazeno {filteredRegions.length} z {regions.length} rajonů.
              </p>
            </div>

            <button onClick={loadRegions} style={styles.secondaryButton}>
              Obnovit
            </button>
          </div>

          <div style={styles.filters}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat rajon..."
              style={styles.searchInput}
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Všechny stavy</option>
              <option value="active">Aktivní</option>
              <option value="inactive">Neaktivní</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.emptyInner}>Načítám rajony...</div>
          ) : (
            <div style={styles.regionList}>
              {filteredRegions.length === 0 && (
                <div style={styles.emptyInner}>
                  Žádný rajon neodpovídá vybranému filtru.
                </div>
              )}

              {filteredRegions.map((region) => {
                const isUpdating = updatingRegionId === region.id;
                const isDeleting = deletingRegionId === region.id;

                return (
                  <article key={region.id} style={styles.regionCard}>
                    <div style={styles.regionTop}>
                      <div>
                        <div style={styles.titleRow}>
                          <h3 style={styles.regionTitle}>{region.name}</h3>
                          <StatusPill active={region.active} />
                        </div>

                        <p style={styles.regionMeta}>
                          Vytvořeno:{" "}
                          {new Date(region.created_at).toLocaleDateString(
                            "cs-CZ"
                          )}
                        </p>
                      </div>

                      <div style={styles.regionActions}>
                        <button
                          onClick={() => toggleRegion(region)}
                          disabled={isUpdating || isDeleting}
                          style={{
                            ...(region.active
                              ? styles.warningButton
                              : styles.greenButton),
                            opacity: isUpdating || isDeleting ? 0.7 : 1,
                          }}
                        >
                          {isUpdating
                            ? "Ukládám..."
                            : region.active
                              ? "Deaktivovat"
                              : "Aktivovat"}
                        </button>

                        {isAdminOrLead && (
                          <button
                            onClick={() => deleteRegion(region)}
                            disabled={isUpdating || isDeleting}
                            style={{
                              ...styles.deleteButton,
                              opacity: isUpdating || isDeleting ? 0.7 : 1,
                            }}
                          >
                            {isDeleting ? "Mažu..." : "Smazat"}
                          </button>
                        )}
                      </div>
                    </div>
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

function StatusPill({ active }: { active: boolean }) {
  if (active) {
    return <span style={styles.statusActive}>Aktivní</span>;
  }

  return <span style={styles.statusInactive}>Neaktivní</span>;
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
    gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
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

  addForm: {
    display: "grid",
    gap: 12,
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

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 190px",
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

  regionList: {
    display: "grid",
    gap: 12,
  },

  regionCard: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 17,
    padding: 17,
  },

  regionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap",
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  regionTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 950,
  },

  regionMeta: {
    color: "#94a3b8",
    margin: "7px 0 0",
    fontSize: 14,
  },

  regionActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  warningButton: {
    background: "#854d0e",
    border: "1px solid #ca8a04",
    color: "#fef3c7",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  greenButton: {
    background: "#052e16",
    border: "1px solid #166534",
    color: "#bbf7d0",
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
};