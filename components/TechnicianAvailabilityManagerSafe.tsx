"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
type AvailabilityStatus = "v_praci" | "dovolena" | "nemoc" | "jine";
type StoredStatus = Exclude<AvailabilityStatus, "v_praci">;
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
  status: StoredStatus;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
};

type PlannedAction = { id: string; status: ActionStatus };
type PlannedActionAssignee = { planned_action_id: string; profile_id: string };

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

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length
    ? parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
    : "U";
}

export default function TechnicianAvailabilityManagerSafe() {
  const pathname = usePathname();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [todayActions, setTodayActions] = useState<PlannedAction[]>([]);
  const [todayAssignees, setTodayAssignees] = useState<PlannedActionAssignee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    status: "v_praci",
    starts_on: dateKey(),
    ends_on: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tableReady, setTableReady] = useState(true);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const canManage = Boolean(
    currentProfile &&
      selectedProfile &&
      (currentProfile.id === selectedProfile.id ||
        ["admin", "vedouci_technik", "sekretariat"].includes(currentProfile.role))
  );

  useEffect(() => {
    if (pathname === "/dashboard") void loadData();
  }, [pathname]);

  async function loadData() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const [meResult, profilesResult, actionsResult, availabilityResult] =
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
          .gte("starts_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .neq("status", "zruseno"),
        supabase
          .from("technician_availability")
          .select("profile_id,status,starts_on,ends_on,note,updated_by,updated_at"),
      ]);

    if (meResult.data) setCurrentProfile(meResult.data as Profile);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setTodayActions((actionsResult.data ?? []) as PlannedAction[]);

    if (availabilityResult.error) {
      setTableReady(false);
      setAvailability([]);
    } else {
      setTableReady(true);
      setAvailability((availabilityResult.data ?? []) as Availability[]);
    }

    const actionIds = (actionsResult.data ?? []).map((action) => action.id);
    if (!actionIds.length) {
      setTodayAssignees([]);
      return;
    }

    const { data } = await supabase
      .from("planned_action_assignees")
      .select("planned_action_id,profile_id")
      .in("planned_action_id", actionIds);
    setTodayAssignees((data ?? []) as PlannedActionAssignee[]);
  }

  function statusFor(profileId: string) {
    const today = dateKey();
    const absence = availability.find((item) => item.profile_id === profileId);

    if (absence) {
      const current =
        absence.starts_on <= today && (!absence.ends_on || absence.ends_on >= today);
      const upcoming = absence.starts_on > today;
      const until = absence.ends_on ? ` do ${shortDate(absence.ends_on)}` : "";

      if (current) {
        if (absence.status === "dovolena") return { label: `Dovolená${until}`, tone: "vacation", note: absence.note };
        if (absence.status === "nemoc") return { label: `Nemocný${until}`, tone: "sick", note: absence.note };
        return { label: `Mimo práci${until}`, tone: "away", note: absence.note };
      }

      if (upcoming) {
        const name =
          absence.status === "dovolena"
            ? "Dovolená"
            : absence.status === "nemoc"
              ? "Nemoc"
              : "Mimo práci";
        return {
          label: `${name} od ${shortDate(absence.starts_on)}`,
          tone: "upcoming",
          note: absence.note,
        };
      }
    }

    const action = todayActions.find((item) =>
      todayAssignees.some(
        (assignee) =>
          assignee.planned_action_id === item.id && assignee.profile_id === profileId
      )
    );

    if (!action) return { label: "V kanceláři", tone: "office", note: null };
    if (action.status === "na_ceste") return { label: "Na cestě", tone: "travel", note: null };
    return { label: "V terénu", tone: "field", note: null };
  }

  useEffect(() => {
    if (pathname !== "/dashboard" || !profiles.length) return;

    function decorate() {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(".vd-technicians .vd-technician")
      );

      rows.forEach((row, index) => {
        const technician = profiles[index];
        if (!technician) return;
        const status = statusFor(technician.id);
        const badge = row.querySelector<HTMLElement>(".vd-status");
        const className = `vd-status ${status.tone}`;

        row.classList.add("vd-technician-clickable");
        row.dataset.profileId = technician.id;
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `${technician.full_name}, ${status.label}`);
        row.title = status.note
          ? `${status.label} – ${status.note}`
          : `${status.label} – kliknutím upravíš dostupnost`;

        if (badge && badge.textContent !== status.label) badge.textContent = status.label;
        if (badge && badge.className !== className) badge.className = className;

        row.onclick = () => openTechnician(technician.id);
        row.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTechnician(technician.id);
          }
        };
      });
    }

    decorate();
    const timeout = window.setTimeout(decorate, 300);
    const interval = window.setInterval(decorate, 1500);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [pathname, profiles, availability, todayActions, todayAssignees]);

  function openTechnician(profileId: string) {
    const existing = availability.find((item) => item.profile_id === profileId);
    setSelectedId(profileId);
    setMessage("");
    setForm(
      existing
        ? {
            status: existing.status,
            starts_on: existing.starts_on,
            ends_on: existing.ends_on ?? "",
            note: existing.note ?? "",
          }
        : { status: "v_praci", starts_on: dateKey(), ends_on: "", note: "" }
    );
  }

  async function save() {
    if (!selectedProfile || !currentProfile || !canManage) return;
    if (!tableReady) {
      setMessage("Databázová tabulka pro dostupnost techniků ještě není vytvořená.");
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

    const result =
      form.status === "v_praci"
        ? await supabase
            .from("technician_availability")
            .delete()
            .eq("profile_id", selectedProfile.id)
        : await supabase.from("technician_availability").upsert(
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

    setSaving(false);
    if (result.error) {
      setMessage(`Nepodařilo se uložit dostupnost: ${result.error.message}`);
      return;
    }

    setSelectedId(null);
    await loadData();
  }

  if (pathname !== "/dashboard" || !selectedProfile) return null;

  return (
    <div className="technician-availability-backdrop" onMouseDown={() => setSelectedId(null)}>
      <section
        className="technician-availability-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="technician-availability-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="technician-availability-heading">
            <div className="technician-availability-avatar">{initials(selectedProfile.full_name)}</div>
            <div>
              <span>Dostupnost technika</span>
              <h2 id="technician-availability-title">{selectedProfile.full_name}</h2>
              <p>{roleLabels[selectedProfile.role]}</p>
            </div>
          </div>
          <button type="button" className="technician-availability-close" onClick={() => setSelectedId(null)} aria-label="Zavřít">×</button>
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
              disabled={!canManage}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>

        {form.status !== "v_praci" && (
          <div className="technician-availability-form">
            <label>
              <span>Od</span>
              <input type="date" value={form.starts_on} onChange={(event) => setForm((current) => ({ ...current, starts_on: event.target.value }))} disabled={!canManage} />
            </label>
            <label>
              <span>Do</span>
              <input type="date" value={form.ends_on} onChange={(event) => setForm((current) => ({ ...current, ends_on: event.target.value }))} disabled={!canManage} />
              <small>Může zůstat prázdné.</small>
            </label>
            <label className="full-width">
              <span>Poznámka</span>
              <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Např. dovolená, pracovní neschopnost, školení…" disabled={!canManage} />
            </label>
          </div>
        )}

        {!canManage && (
          <div className="technician-availability-info">
            Stav může měnit daný technik, admin, vedoucí technik nebo sekretariát.
          </div>
        )}

        <footer>
          <button type="button" className="secondary" onClick={() => setSelectedId(null)}>Zavřít</button>
          {canManage && (
            <button type="button" className="primary" onClick={save} disabled={saving || !tableReady}>
              {saving ? "Ukládám…" : form.status === "v_praci" ? "Nastavit v práci" : "Uložit stav"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
