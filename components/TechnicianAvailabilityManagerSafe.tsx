"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
type StoredStatus = "dovolena" | "nemoc" | "jine";
type ActionStatus = "planovano" | "potvrzeno" | "na_ceste" | "rozpracovano" | "hotovo" | "zruseno";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  calendar_color: string;
};

type Availability = {
  id: string;
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
  status: StoredStatus;
  starts_on: string;
  ends_on: string;
  note: string;
};

const statusLabels: Record<StoredStatus, string> = {
  dovolena: "Dovolená",
  nemoc: "Nemoc",
  jine: "Jiné / mimo práci",
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const weekDays = ["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"];

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shortDate(value: string) {
  return dateFromKey(value).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

function longDate(value: string) {
  return dateFromKey(value).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

function startOfCalendarGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - mondayIndex);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") : "U";
}

function contrastColor(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#10273a" : "#ffffff";
}

function statusTone(status: StoredStatus) {
  if (status === "dovolena") return "vacation";
  if (status === "nemoc") return "sick";
  return "away";
}

function emptyForm(): FormState {
  const today = dateKey();
  return { status: "dovolena", starts_on: today, ends_on: today, note: "" };
}

export default function TechnicianAvailabilityManagerSafe() {
  const pathname = usePathname();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [todayActions, setTodayActions] = useState<PlannedAction[]>([]);
  const [todayAssignees, setTodayAssignees] = useState<PlannedActionAssignee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tableReady, setTableReady] = useState(true);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const selectedAvailability = useMemo(
    () => availability
      .filter((item) => item.profile_id === selectedId)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
    [availability, selectedId]
  );

  const calendarDays = useMemo(() => {
    const start = startOfCalendarGrid(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const canManage = Boolean(
    currentProfile &&
      selectedProfile &&
      (currentProfile.id === selectedProfile.id || ["admin", "vedouci_technik", "sekretariat"].includes(currentProfile.role))
  );

  useEffect(() => {
    if (pathname === "/dashboard") void loadData();
  }, [pathname]);

  async function loadData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const [meResult, profilesResult, actionsResult, availabilityResult] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,role,active,calendar_color").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id,email,full_name,role,active,calendar_color").eq("active", true).order("full_name", { ascending: true }),
      supabase.from("planned_actions").select("id,status").gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).neq("status", "zruseno"),
      supabase.from("technician_availability").select("id,profile_id,status,starts_on,ends_on,note,updated_by,updated_at").order("starts_on", { ascending: true }),
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

  const statusFor = useCallback((profileId: string) => {
    const today = dateKey();
    const todayDate = dateFromKey(today);
    const profileAvailability = availability
      .filter((item) => item.profile_id === profileId)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const current = profileAvailability.find((item) => item.starts_on <= today && (!item.ends_on || item.ends_on >= today));

    if (current) {
      const until = current.ends_on ? ` do ${shortDate(current.ends_on)}` : "";
      if (current.status === "dovolena") return { label: `Dovolená${until}`, tone: "vacation", note: current.note };
      if (current.status === "nemoc") return { label: `Nemocný${until}`, tone: "sick", note: current.note };
      return { label: `Mimo práci${until}`, tone: "away", note: current.note };
    }

    const upcoming = profileAvailability.find((item) => {
      if (item.starts_on <= today) return false;
      const daysUntil = Math.round((dateFromKey(item.starts_on).getTime() - todayDate.getTime()) / 86_400_000);
      return daysUntil >= 1 && daysUntil <= 7;
    });

    if (upcoming) {
      const daysUntil = Math.round((dateFromKey(upcoming.starts_on).getTime() - todayDate.getTime()) / 86_400_000);
      const when = daysUntil === 1 ? "zítra" : `za ${daysUntil} dní`;
      return { label: `${statusLabels[upcoming.status]} ${when}`, tone: "upcoming", note: upcoming.note };
    }

    const action = todayActions.find((item) =>
      todayAssignees.some((assignee) => assignee.planned_action_id === item.id && assignee.profile_id === profileId)
    );

    if (!action) return { label: "V kanceláři", tone: "office", note: null };
    if (action.status === "na_ceste") return { label: "Na cestě", tone: "travel", note: null };
    return { label: "V terénu", tone: "field", note: null };
  }, [availability, todayActions, todayAssignees]);

  useEffect(() => {
    if (pathname !== "/dashboard" || !profiles.length) return;

    function decorate() {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".vd-technicians .vd-technician"));

      rows.forEach((row, index) => {
        const technician = profiles[index];
        if (!technician) return;
        const status = statusFor(technician.id);
        const badge = row.querySelector<HTMLElement>(".vd-status");
        const avatar = row.querySelector<HTMLElement>(".vd-technician-avatar");
        const className = `vd-status ${status.tone}`;

        row.classList.add("vd-technician-clickable");
        row.dataset.profileId = technician.id;
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `${technician.full_name}, ${status.label}`);
        row.title = status.note ? `${status.label} – ${status.note}` : `${status.label} – kliknutím otevřeš kalendář`;

        if (badge && badge.textContent !== status.label) badge.textContent = status.label;
        if (badge && badge.className !== className) badge.className = className;
        if (avatar) {
          avatar.style.background = technician.calendar_color;
          avatar.style.color = contrastColor(technician.calendar_color);
        }

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
  }, [pathname, profiles, statusFor]);

  function openTechnician(profileId: string) {
    const today = new Date();
    setSelectedId(profileId);
    setEditingAvailabilityId(null);
    setMessage("");
    setForm(emptyForm());
    setRangeAnchor(null);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function resetAvailabilityForm() {
    setEditingAvailabilityId(null);
    setForm(emptyForm());
    setRangeAnchor(null);
    setMessage("");
  }

  function editAvailability(item: Availability) {
    const start = dateFromKey(item.starts_on);
    setEditingAvailabilityId(item.id);
    setForm({
      status: item.status,
      starts_on: item.starts_on,
      ends_on: item.ends_on ?? item.starts_on,
      note: item.note ?? "",
    });
    setVisibleMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setRangeAnchor(null);
    setMessage("");
  }

  function availabilityOnDay(day: string) {
    return selectedAvailability.find((item) => item.starts_on <= day && (!item.ends_on || item.ends_on >= day));
  }

  function selectCalendarDay(day: string) {
    const existing = availabilityOnDay(day);
    if (existing && existing.id !== editingAvailabilityId && !rangeAnchor) {
      editAvailability(existing);
      return;
    }

    if (!rangeAnchor) {
      setRangeAnchor(day);
      setForm((current) => ({ ...current, starts_on: day, ends_on: day }));
      return;
    }

    const startsOn = rangeAnchor <= day ? rangeAnchor : day;
    const endsOn = rangeAnchor <= day ? day : rangeAnchor;
    setForm((current) => ({ ...current, starts_on: startsOn, ends_on: endsOn }));
    setRangeAnchor(null);
  }

  async function save() {
    if (!selectedProfile || !currentProfile || !canManage) return;
    if (!tableReady) {
      setMessage("Databázová tabulka pro dostupnost techniků ještě není připravená.");
      return;
    }
    if (!form.starts_on || !form.ends_on) {
      setMessage("V kalendáři vyber den nebo rozsah dnů.");
      return;
    }
    if (form.ends_on < form.starts_on) {
      setMessage("Datum do nemůže být před datem od.");
      return;
    }

    const overlap = selectedAvailability.find((item) => {
      if (item.id === editingAvailabilityId) return false;
      const itemEnd = item.ends_on ?? "9999-12-31";
      return item.starts_on <= form.ends_on && itemEnd >= form.starts_on;
    });
    if (overlap) {
      setMessage(`Vybrané dny se překrývají se záznamem „${statusLabels[overlap.status]}“ od ${shortDate(overlap.starts_on)}.`);
      return;
    }

    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const payload = {
      profile_id: selectedProfile.id,
      status: form.status,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      note: form.note.trim() || null,
      updated_by: currentProfile.id,
    };
    const result = editingAvailabilityId
      ? await supabase.from("technician_availability").update(payload).eq("id", editingAvailabilityId)
      : await supabase.from("technician_availability").insert(payload);

    setSaving(false);
    if (result.error) {
      setMessage(`Nepodařilo se uložit nepřítomnost: ${result.error.message}`);
      return;
    }

    resetAvailabilityForm();
    await loadData();
  }

  async function deleteAvailability(item: Availability) {
    if (!canManage || !window.confirm(`Opravdu smazat „${statusLabels[item.status]}“ od ${longDate(item.starts_on)}?`)) return;
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("technician_availability").delete().eq("id", item.id);
    setSaving(false);
    if (error) {
      setMessage(`Nepodařilo se záznam smazat: ${error.message}`);
      return;
    }
    if (editingAvailabilityId === item.id) resetAvailabilityForm();
    await loadData();
  }

  if (pathname !== "/dashboard" || !selectedProfile) return null;

  return (
    <div className="technician-availability-backdrop" onMouseDown={() => setSelectedId(null)}>
      <section className="technician-availability-modal" role="dialog" aria-modal="true" aria-labelledby="technician-availability-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="technician-availability-heading">
            <div className="technician-availability-avatar" style={{ background: selectedProfile.calendar_color, color: contrastColor(selectedProfile.calendar_color) }}>{initials(selectedProfile.full_name)}</div>
            <div><span>Kalendář dostupnosti</span><h2 id="technician-availability-title">{selectedProfile.full_name}</h2><p>{roleLabels[selectedProfile.role]}</p></div>
          </div>
          <button type="button" className="technician-availability-close" onClick={() => setSelectedId(null)} aria-label="Zavřít">×</button>
        </header>

        {!tableReady && <div className="technician-availability-warning">Pro ukládání je potřeba jednou spustit připravenou SQL migraci v Supabase.</div>}
        {message && <div className="technician-availability-error">{message}</div>}

        <div className="technician-availability-body">
          <div className="technician-availability-status-grid">
            {(Object.keys(statusLabels) as StoredStatus[]).map((status) => (
              <button key={status} type="button" className={form.status === status ? `active ${status}` : status} onClick={() => setForm((current) => ({ ...current, status }))} disabled={!canManage}>{statusLabels[status]}</button>
            ))}
          </div>

          <div className="technician-availability-calendar">
            <div className="technician-availability-calendar-toolbar">
              <button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
              <strong>{visibleMonth.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</strong>
              <button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
            </div>
            <p className="technician-availability-calendar-help">Klikni na první a poslední den. Pro jeden den klikni dvakrát.</p>
            <div className="technician-availability-week">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="technician-availability-month">
              {calendarDays.map((date) => {
                const key = dateKey(date);
                const existing = availabilityOnDay(key);
                const selected = key >= form.starts_on && key <= form.ends_on;
                const outside = date.getMonth() !== visibleMonth.getMonth();
                return (
                  <button type="button" key={key} className={`${outside ? "outside" : ""} ${selected ? "selected" : ""} ${rangeAnchor === key ? "anchor" : ""}`} onClick={() => selectCalendarDay(key)} disabled={!canManage} aria-label={existing ? `${longDate(key)}: ${statusLabels[existing.status]}` : longDate(key)}>
                    <span>{date.getDate()}</span>
                    {existing && <i className={statusTone(existing.status)} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="technician-availability-form">
            <label><span>Od</span><input type="date" value={form.starts_on} onChange={(event) => setForm((current) => ({ ...current, starts_on: event.target.value }))} disabled={!canManage} /></label>
            <label><span>Do</span><input type="date" value={form.ends_on} onChange={(event) => setForm((current) => ({ ...current, ends_on: event.target.value }))} disabled={!canManage} /></label>
            <label className="full-width"><span>Poznámka – volitelná</span><textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Např. dovolená, pracovní neschopnost, školení…" disabled={!canManage} /></label>
          </div>

          {canManage && <div className="technician-availability-save-row"><button type="button" className="secondary" onClick={resetAvailabilityForm}>{editingAvailabilityId ? "Zrušit úpravu" : "Vyčistit"}</button><button type="button" className="primary" onClick={save} disabled={saving || !tableReady}>{saving ? "Ukládám…" : editingAvailabilityId ? "Uložit změnu" : "Přidat do kalendáře"}</button></div>}

          {!canManage && <div className="technician-availability-info">Kalendář může měnit daný technik, admin, vedoucí technik nebo sekretariát.</div>}

          <section className="technician-availability-list">
            <h3>Naplánované nepřítomnosti</h3>
            {selectedAvailability.length === 0 ? <p className="empty">Zatím tu není žádná dovolená ani jiná nepřítomnost.</p> : selectedAvailability.map((item) => (
              <article key={item.id}>
                <i className={statusTone(item.status)} />
                <div><strong>{statusLabels[item.status]}</strong><span>{longDate(item.starts_on)}{item.ends_on && item.ends_on !== item.starts_on ? ` – ${longDate(item.ends_on)}` : ""}</span>{item.note && <small>{item.note}</small>}</div>
                {canManage && <div className="actions"><button type="button" onClick={() => editAvailability(item)}>Upravit</button><button type="button" className="danger" onClick={() => void deleteAvailability(item)} disabled={saving}>Smazat</button></div>}
              </article>
            ))}
          </section>
        </div>

        <footer><button type="button" className="secondary" onClick={() => setSelectedId(null)}>Zavřít</button></footer>
      </section>
    </div>
  );
}
