"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
type AvailabilityStatus = "v_praci" | "dovolena" | "nemoc" | "jine";
type ActionStatus = "planovano" | "potvrzeno" | "na_ceste" | "rozpracovano" | "hotovo" | "zruseno";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
};

type Availability = {
  profile_id: string;
  status: Exclude<AvailabilityStatus, "v_praci">;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
};

type PlannedAction = {
  id: string;
  status: ActionStatus;
};

type PlannedActionAssignee = {
  planned_action_id: string;
  profile_id: string;
};

type FormState = {
  status: AvailabilityStatus;
  starts_on: string;
  ends_on: string;
  note: string;
};

const statusLabels: Record<AvailabilityStatus, string> = {
  v_praci: "V práci",
  dovolena: "Dovolená",
  nemoc: "Nemocný",
  jine: "Jiné / mimo práci",
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

export default function TechnicianAvailabilityManager() {
  const pathname = usePathname();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [todayActions, setTodayActions] = useState<PlannedAction[]>([]);
  const [todayAssignees, setTodayAssignees] = useState<PlannedActionAssignee[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    status: "v_praci",
    starts_on: localDateKey(),
    ends_on: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tableReady, setTableReady] = useState(true);

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const selectedAvailability = useMemo(
    () => availability.find((item) => item.profile_id === selectedProfileId) ?? null,
    [availability, selectedProfileId]
  );

  const canManageSelected = Boolean(
    selectedProfile &&
      currentProfile &&
      (currentProfile.id === selectedProfile.id ||
        ["admin", "vedouci_technik", "sekretariat"].includes(currentProfile.role))
  );

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    void loadData();
  }, [pathname]);

  async function loadData() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [currentResult, profilesResult, actionsResult, availabilityResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,full_name,role,active")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id,email,full_name,role,active")
          .eq("active", true)
          .order("full_name", { ascending: true }),
        supabase
          .from("planned_actions")
          .select("id,status")
          .gte("starts_at", todayStart.toISOString())
          .lt("starts_at", tomorrowStart.toISOString())
          .neq("status", "zruseno"),
        supabase
          .from("technician_availability")
          .select("profile_id,status,starts_on,ends_on,note,updated_by,updated_at"),
      ]);

    if (currentResult.data) setCurrentProfile(currentResult.data as Profile);
    if (profilesResult.data) setProfiles(profilesResult.data as Profile[]);
    if (actionsResult.data) setTodayActions(actionsResult.data as PlannedAction[]);

    if (availabilityResult.error) {
      setTableReady(false);
      setAvailability([]);
    } else {
      setTableReady(true);
      setAvailability((availabilityResult.data ?? []) as Availability[]);
    }

    const actionIds = (actionsResult.data ?? []).map((item) => item.id);
    if (actionIds.length === 0) {
      setTodayAssignees([]);
      return;
    }

    const { data: assigneeData } = await supabase
      .from("planned_action_assignees")
      .select("planned_action_id,profile_id")
      .in("planned_action_id", actionIds);

    setTodayAssignees((assigneeData ?? []) as PlannedActionAssignee[]);
  }

  function getStatus(profileId: string) {
    const today = localDateKey();
    const absence = availability.find((item) => item.profile_id === profileId);

    if (absence) {
      const isCurrent =
        absence.starts_on <= today && (!absence.ends_on || absence.ends_on >= today);
      const isUpcoming = absence.starts_on > today;
      const until = absence.ends_on ? ` do ${formatShortDate(absence.ends_on)}` : "";

      if (isCurrent) {
        if (absence.status === "dovolena") {
          return { label: `Dovolená${until}`, tone: "vacation", note: absence.note };
        }
        if (absence.status === "nemoc") {
          return { label: `Nemocný${until}`, tone: "sick", note: absence.note };
        }
        return { label: `Mimo práci${until}`, tone: "away", note: absence.note };
      }

      if (isUpcoming) {
        const prefix =
          absence.status === "dovolena"
            ? "Dovolená"
            : absence.status === "nemoc"
              ? "Nemoc"
              : "Mimo práci";
        return {
          label: `${prefix} od ${formatShortDate(absence.starts_on)}`,
          tone: "upcoming",
          note: absence.note,
        };
      }
    }

    const assignedAction = todayActions.find((action) =>
      todayAssignees.some(
        (item) => item.planned_action_id === action.id && item.profile_id === profileId
      )
    );

    if (!assignedAction) return { label: "V kanceláři", tone: "office", note: null };
    if (assignedAction.status === "na_ceste") {
      return { label: "Na cestě", tone: "travel", note: null };
    }
    return { label: "V terénu", tone: "field", note: null };
  }

  useEffect(() => {
    if (pathname !== "/dashboard" || profiles.length === 0) return;

    let disposed = false;

    function decorateRows() {
      if (disposed) return;
      const container = document.querySelector<HTMLElement>(".vd-technicians");
      if (!container) return;

      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(".vd-technician")
      );

      rows.forEach((row, index) => {
        const technician = profiles[index];
        if (!technician) return;

        const status = getStatus(technician.id);
        const badge = row.querySelector<HTMLElement>(".vd-status");

        row.dataset.profileId = technician.id;
        row.classList.add("vd-technician-clickable");
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute(
          "aria-label",
          `${technician.full_name}, ${status.label}. Otevřít docházku.`
        );
        row.title = status.note
          ? `${status.label} – ${status.note}`
          : `${status.label} – kliknutím upravíš dostupnost`;

        if (badge) {
          badge.textContent = status.label;
          badge.className = `vd-status ${status.tone}`;
        }

        row.onclick = () => openProfile(technician.id);
        row.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openProfile(technician.id);
          }
        };
      });
    }

    decorateRows();
    const observer = new MutationObserver(decorateRows);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [pathname, profiles, availability, todayActions, todayAssignees]);

  function openProfile(profileId: string) {
    const existing = availability.find((item) => item.profile_id === profileId);
    setSelectedProfileId(profileId);
    setMessage("");
    setForm(
      existing
        ? {
            status: existing.status,
            starts_on: existing.starts_on,
            ends_on: existing.ends_on ?? "",
            note: existing.note ?? "",
          }
        : {
            status: "v_praci",
            starts_on: localDateKey(),
            ends_on: "",
            note: "",
          }
    );
  }

  async function saveAvailability() {
    if (!selectedProfile || !currentProfile || !canManageSelected) return;
    if (!tableReady) {
      setMessage("Databázová tabulka pro dovolené a nemoc ještě není vytvořená.");
      return;
    }
    if (form.status !== "v_praci" && !form.starts_on) {
      setMessage("Vyplň datum od.");
      return;
    }
    if (form.ends_on && form.ends_on < form.starts_on) {
      setMessage("Datum do nemůže být před datem od.");
      return;
    }

    setSaving(true);
    setMessage("");
    const supabase = createClient();

    if (form.status === "v_praci") {
      const { error } = await supabase
        .from("technician_availability")
        .delete()
        .eq("profile_id", selectedProfile.id);

      if (error) {
        setMessage(`Nepodařilo se nastavit dostupnost: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("technician_availability").upsert(
        {
          profile_id: selectedProfile.id,
          status: form.status,
          starts_on: form.starts_on,
          ends_on: form.ends_on || null,
          note: form.note.trim() || null,
          updated_by: currentProfile.id,
        },
        { onConflict: "profile_id" }
      );

      if (error) {
        setMessage(`Nepodařilo se uložit dostupnost: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSelectedProfileId(null);
    await loadData();
  }

  if (pathname !== "/dashboard" || !selectedProfile) return null;

  return (
    <div className="technician-availability-backdrop" onMouseDown={() => setSelectedProfileId(null)}>
      <section
        className="technician-availability-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="technician-availability-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="technician-availability-heading">
            <div className="technician-availability-avatar">
              {initials(selectedProfile.full_name)}
            </div>
            <div>
              <span>Dostupnost technika</span>
              <h2 id="technician-availability-title">{selectedProfile.full_name}</h2>
              <p>{roleLabels[selectedProfile.role]}</p>
            </div>
          </div>
          <button
            type="button"
            className="technician-availability-close"
            aria-label="Zavřít"
            onClick={() => setSelectedProfileId(null)}
          >
            ×
          </button>
        </header>

        {!tableReady && (
          <div className="technician-availability-warning">
            Pro ukládání je potřeba jednou spustit připravenou SQL migraci v Supabase.
          </div>
        )}

        {message && <div className="technician-availability-error">{message}</div>}

        <div className="technician-availability-status-grid">
          {(Object.keys(statusLabels) as AvailabilityStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              className={form.status === status ? `active ${status}` : status}
              onClick={() => setForm((current) => ({ ...current, status }))}
              disabled={!canManageSelected}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>

        {form.status !== "v_praci" && (
          <div className="technician-availability-form">
            <label>
              <span>Od</span>
              <input
                type="date"
                value={form.starts_on}
                onChange={(event) =>
                  setForm((current) => ({ ...current, starts_on: event.target.value }))
                }
                disabled={!canManageSelected}
              />
            </label>
            <label>
              <span>Do</span>
              <input
                type="date"
                value={form.ends_on}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ends_on: event.target.value }))
                }
                disabled={!canManageSelected}
              />
              <small>Může zůstat prázdné.</small>
            </label>
            <label className="full-width">
              <span>Poznámka</span>
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="Např. dovolená, pracovní neschopnost, školení…"
                disabled={!canManageSelected}
              />
            </label>
          </div>
        )}

        {!canManageSelected && (
          <div className="technician-availability-info">
            Stav může měnit daný technik, admin, vedoucí technik nebo sekretariát.
          </div>
        )}

        <footer>
          <button
            type="button"
            className="secondary"
            onClick={() => setSelectedProfileId(null)}
          >
            Zavřít
          </button>
          {canManageSelected && (
            <button
              type="button"
              className="primary"
              onClick={saveAvailability}
              disabled={saving || !tableReady}
            >
              {saving ? "Ukládám…" : form.status === "v_praci" ? "Nastavit v práci" : "Uložit stav"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
