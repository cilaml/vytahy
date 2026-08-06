"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  calendar_color: string;
};
type Elevator = { id: string; label: string; address: string };
type ActionType = "servis" | "porucha" | "montaz" | "oprava" | "op" | "oz" | "ip" | "jine";
type Visibility = "all" | "selected";
type ActionRow = {
  id: string;
  title: string;
  action_type: ActionType;
  status: string;
  starts_at: string;
  ends_at: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  description: string | null;
  elevator_id: string | null;
  visibility: Visibility;
  created_by: string | null;
};
type Assignee = { planned_action_id: string; profile_id: string; is_lead: boolean };
type Viewer = { planned_action_id: string; profile_id: string };
type ActionForm = {
  title: string;
  action_type: ActionType;
  date: string;
  start: string;
  end: string;
  address: string;
  elevator_id: string;
  contact_name: string;
  contact_phone: string;
  description: string;
  visibility: Visibility;
};

const typeLabels: Record<ActionType, string> = {
  servis: "Servis",
  porucha: "Porucha",
  montaz: "Montáž",
  oprava: "Oprava",
  op: "OP",
  oz: "OZ",
  ip: "IP",
  jine: "Jiné",
};

const typeColors: Record<ActionType, string> = {
  servis: "#3478f6",
  porucha: "#e34a4a",
  montaz: "#8156e8",
  oprava: "#e98a25",
  op: "#079447",
  oz: "#00a1a7",
  ip: "#667b8e",
  jine: "#7d8793",
};

const statusLabels: Record<string, string> = {
  planovano: "Naplánováno",
  potvrzeno: "Potvrzeno",
  na_ceste: "Na cestě",
  rozpracovano: "Rozpracováno",
  hotovo: "Hotovo",
  zruseno: "Zrušeno",
};

const weekDays = ["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"];
const managerRoles: UserRole[] = ["admin", "vedouci_technik", "sekretariat", "servis"];

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(value: string) {
  return new Date(value).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function startOfCalendarGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - mondayIndex);
}

function customElevatorFromDescription(description: string | null) {
  if (!description) return "";
  const line = description.split("\n").find((item) => item.startsWith("Výtah mimo databázi:"));
  return line?.replace("Výtah mimo databázi:", "").trim() ?? "";
}

function noteFromDescription(description: string | null) {
  if (!description) return "";
  return description
    .split("\n")
    .filter((line) => !line.startsWith("Výtah mimo databázi:"))
    .join("\n")
    .trim();
}

function emptyForm(date: string): ActionForm {
  return {
    title: "",
    action_type: "servis",
    date,
    start: "08:00",
    end: "10:00",
    address: "",
    elevator_id: "",
    contact_name: "",
    contact_phone: "",
    description: "",
    visibility: "all",
  };
}

export default function PlannedActionsPage() {
  const todayKey = toDateKey(new Date());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedViewers, setSelectedViewers] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [elevatorQuery, setElevatorQuery] = useState("");
  const [form, setForm] = useState<ActionForm>(() => emptyForm(todayKey));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedAction) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedAction(null);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedAction]);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = "/login";
      return;
    }
    setCurrentUserId(authData.user.id);

    const [profilesResult, elevatorsResult, actionsResult, assigneesResult, viewersResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,role,active,calendar_color").eq("active", true).order("full_name"),
      supabase.from("elevators").select("id,label,address").eq("status", "aktivni").order("address"),
      supabase.from("planned_actions").select("id,title,action_type,status,starts_at,ends_at,address,contact_name,contact_phone,description,elevator_id,visibility,created_by").order("starts_at"),
      supabase.from("planned_action_assignees").select("planned_action_id,profile_id,is_lead"),
      supabase.from("planned_action_viewers").select("planned_action_id,profile_id"),
    ]);

    const error = profilesResult.error || elevatorsResult.error || actionsResult.error || assigneesResult.error || viewersResult.error;
    if (error) setMessage(`Načtení se nepovedlo: ${error.message}`);
    const loadedProfiles = (profilesResult.data ?? []) as Profile[];
    setProfiles(loadedProfiles);
    setCurrentUserRole(loadedProfiles.find((profile) => profile.id === authData.user.id)?.role ?? null);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setActions((actionsResult.data ?? []) as ActionRow[]);
    setAssignees((assigneesResult.data ?? []) as Assignee[]);
    setViewers((viewersResult.data ?? []) as Viewer[]);
    setLoading(false);
  }

  const actionsByDay = useMemo(() => {
    const grouped = new Map<string, ActionRow[]>();
    for (const item of actions) {
      const key = toDateKey(new Date(item.starts_at));
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    grouped.forEach((items) => items.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
    return grouped;
  }, [actions]);

  const calendarDays = useMemo(() => {
    const start = startOfCalendarGrid(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const elevatorSuggestions = useMemo(() => {
    const query = elevatorQuery.trim().toLocaleLowerCase("cs-CZ");
    if (!query || form.elevator_id) return [];
    return elevators
      .filter((item) => `${item.address} ${item.label}`.toLocaleLowerCase("cs-CZ").includes(query))
      .slice(0, 10);
  }, [elevators, elevatorQuery, form.elevator_id]);

  const dayActions = actionsByDay.get(selectedDate) ?? [];

  function toggleId(id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function chooseElevator(elevator: Elevator) {
    setElevatorQuery(`${elevator.address} — ${elevator.label}`);
    setForm((current) => ({
      ...current,
      elevator_id: elevator.id,
      address: current.address || elevator.address,
      title: current.title || elevator.label,
    }));
  }

  function selectDay(date: Date) {
    const key = toDateKey(date);
    setSelectedDate(key);
    if (!editingActionId) setForm((current) => ({ ...current, date: key }));
  }

  function resetForm(date = selectedDate) {
    setForm(emptyForm(date));
    setElevatorQuery("");
    setSelectedAssignees([]);
    setSelectedViewers([]);
    setEditingActionId(null);
  }

  async function saveAction(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSuccess("");

    const startsAt = new Date(`${form.date}T${form.start}:00`);
    const endsAt = new Date(`${form.date}T${form.end}:00`);
    if (endsAt <= startsAt) {
      setMessage("Čas konce musí být později než čas začátku.");
      setSaving(false);
      return;
    }

    const customElevator = !form.elevator_id ? elevatorQuery.trim() : "";
    const description = [customElevator ? `Výtah mimo databázi: ${customElevator}` : "", form.description.trim()]
      .filter(Boolean)
      .join("\n");
    const payload = {
      title: form.title.trim(),
      action_type: form.action_type,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      address: form.address.trim() || customElevator,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      description: description || null,
      elevator_id: form.elevator_id || null,
      visibility: form.visibility,
    };

    const supabase = createClient();
    let actionId = editingActionId;

    if (editingActionId) {
      const { error } = await supabase.from("planned_actions").update(payload).eq("id", editingActionId);
      if (error) {
        setMessage(`Akci se nepovedlo upravit: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("planned_actions")
        .insert({ ...payload, created_by: currentUserId })
        .select("id")
        .single();
      if (error || !data) {
        setMessage(`Akci se nepovedlo uložit: ${error?.message ?? "neznámá chyba"}`);
        setSaving(false);
        return;
      }
      actionId = data.id;
    }

    if (!actionId) {
      setMessage("Akci se nepovedlo uložit.");
      setSaving(false);
      return;
    }

    const [deleteAssignees, deleteViewers] = await Promise.all([
      supabase.from("planned_action_assignees").delete().eq("planned_action_id", actionId),
      supabase.from("planned_action_viewers").delete().eq("planned_action_id", actionId),
    ]);
    const relationError = deleteAssignees.error || deleteViewers.error;
    if (relationError) {
      setMessage(`Akce je uložená, ale přiřazení se nepovedlo změnit: ${relationError.message}`);
      setSaving(false);
      await load();
      return;
    }

    const relationResults = await Promise.all([
      selectedAssignees.length > 0
        ? supabase.from("planned_action_assignees").insert(
            selectedAssignees.map((profileId, index) => ({
              planned_action_id: actionId,
              profile_id: profileId,
              is_lead: index === 0,
            }))
          )
        : Promise.resolve({ error: null }),
      form.visibility === "selected" && selectedViewers.length > 0
        ? supabase.from("planned_action_viewers").insert(
            selectedViewers.map((profileId) => ({ planned_action_id: actionId, profile_id: profileId }))
          )
        : Promise.resolve({ error: null }),
    ]);
    const insertError = relationResults.find((result) => result.error)?.error;
    if (insertError) setMessage(`Akce je uložená, ale přiřazení se nepovedlo dokončit: ${insertError.message}`);

    const savedDate = form.date;
    resetForm(savedDate);
    setSelectedDate(savedDate);
    const createdDate = new Date(`${savedDate}T12:00:00`);
    setVisibleMonth(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
    if (!insertError) setSuccess(editingActionId ? "Akce byla upravena." : "Akce byla přidána do kalendáře.");
    await load();
    setSaving(false);
  }

  function profilesForAction(actionId: string) {
    return assignees
      .filter((item) => item.planned_action_id === actionId)
      .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
      .map((item) => profiles.find((profile) => profile.id === item.profile_id))
      .filter((profile): profile is Profile => Boolean(profile));
  }

  function namesForAction(actionId: string) {
    return profilesForAction(actionId).map((profile) => profile.full_name).join(", ");
  }

  function viewersForAction(action: ActionRow) {
    if (action.visibility === "all") return "Všichni zaměstnanci";
    const visibleIds = new Set([
      ...viewers.filter((item) => item.planned_action_id === action.id).map((item) => item.profile_id),
      ...assignees.filter((item) => item.planned_action_id === action.id).map((item) => item.profile_id),
    ]);
    const names = profiles.filter((profile) => visibleIds.has(profile.id)).map((profile) => profile.full_name);
    return names.length ? names.join(", ") : "Jen autor akce";
  }

  function actionColor(action: ActionRow) {
    const colors = [...new Set(profilesForAction(action.id).map((profile) => profile.calendar_color))];
    if (colors.length === 0) return typeColors[action.action_type];
    if (colors.length === 1) return colors[0];
    const step = 100 / colors.length;
    return `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`).join(", ")})`;
  }

  function actionElevator(action: ActionRow) {
    const stored = elevators.find((item) => item.id === action.elevator_id);
    return stored ? `${stored.address} — ${stored.label}` : customElevatorFromDescription(action.description);
  }

  function canManageAction(action: ActionRow) {
    return action.created_by === currentUserId || Boolean(currentUserRole && managerRoles.includes(currentUserRole));
  }

  function editAction(action: ActionRow) {
    const startsAt = new Date(action.starts_at);
    const date = toDateKey(startsAt);
    setEditingActionId(action.id);
    setForm({
      title: action.title,
      action_type: action.action_type,
      date,
      start: toTimeKey(action.starts_at),
      end: toTimeKey(action.ends_at),
      address: action.address,
      elevator_id: action.elevator_id ?? "",
      contact_name: action.contact_name ?? "",
      contact_phone: action.contact_phone ?? "",
      description: noteFromDescription(action.description),
      visibility: action.visibility,
    });
    setElevatorQuery(actionElevator(action));
    setSelectedAssignees(assignees.filter((item) => item.planned_action_id === action.id).sort((a, b) => Number(b.is_lead) - Number(a.is_lead)).map((item) => item.profile_id));
    setSelectedViewers(viewers.filter((item) => item.planned_action_id === action.id).map((item) => item.profile_id));
    setSelectedDate(date);
    setVisibleMonth(new Date(startsAt.getFullYear(), startsAt.getMonth(), 1));
    setSelectedAction(null);
    setMessage("");
    setSuccess("");
    window.setTimeout(() => document.querySelector(".planning-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function deleteAction(action: ActionRow) {
    if (!window.confirm(`Opravdu smazat akci „${action.title}“?`)) return;
    setDeleting(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("planned_actions").delete().eq("id", action.id);
    setDeleting(false);
    if (error) {
      setMessage(`Akci se nepovedlo smazat: ${error.message}`);
      return;
    }
    setSelectedAction(null);
    if (editingActionId === action.id) resetForm();
    setSuccess("Akce byla smazána.");
    await load();
  }

  return (
    <main className="planning-page">
      <header className="planning-head">
        <div><p className="planning-eyebrow">PLÁNOVÁNÍ</p><h1>Plánované akce</h1><p>Firemní kalendář servisu, montáží, oprav a prohlídek.</p></div>
        <a href="/dashboard">← Zpět na přehled</a>
      </header>

      {message && <div className="planning-notice error">{message}</div>}
      {success && <div className="planning-notice success">{success}</div>}

      <section className="planning-layout">
        <form className="planning-panel planning-form" onSubmit={saveAction}>
          <div className="planning-panel-head">
            <div><h2>{editingActionId ? "Upravit akci" : "Nová akce"}</h2><p>Výtah lze vyhledat, napsat ručně nebo úplně vynechat.</p></div>
            {editingActionId && <button type="button" className="planning-small-secondary" onClick={() => resetForm()}>Zrušit úpravu</button>}
          </div>

          <label>Název<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Např. výměna rozvaděče" /></label>
          <div className="planning-form-grid two">
            <label>Typ<select value={form.action_type} onChange={(event) => setForm({ ...form, action_type: event.target.value as ActionType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Výtah – volitelný<div className="planning-combobox"><input value={elevatorQuery} onChange={(event) => { setElevatorQuery(event.target.value); setForm({ ...form, elevator_id: "" }); }} placeholder="Hledej adresu/označení nebo napiš vlastní…" />{elevatorSuggestions.length > 0 && <div className="planning-suggestions">{elevatorSuggestions.map((elevator) => <button type="button" key={elevator.id} onClick={() => chooseElevator(elevator)}><strong>{elevator.address}</strong><span>{elevator.label}</span></button>)}</div>}</div><small>{form.elevator_id ? "Vybraný výtah je propojený s databází." : elevatorQuery ? "Text se uloží jako výtah mimo databázi." : "Akce může zůstat bez výtahu."}</small></label>
          </div>

          <div className="planning-form-grid three">
            <label>Datum<input required type="date" value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value }); setSelectedDate(event.target.value); const date = new Date(`${event.target.value}T12:00:00`); setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} /></label>
            <label>Od<input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
            <label>Do<input required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
          </div>

          <label>Adresa – volitelná<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Doplní se z uloženého výtahu, nebo ji napiš ručně" /></label>
          <div className="planning-form-grid two"><label>Kontakt<input value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} /></label><label>Telefon<input value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} /></label></div>
          <label>Poznámka<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>

          <fieldset>
            <legend>Přiřazení zaměstnanců – volitelné</legend>
            <div className="planning-people">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={selectedAssignees.includes(profile.id)} onChange={() => toggleId(profile.id, setSelectedAssignees)} /><i style={{ background: profile.calendar_color }} />{profile.full_name}</label>)}</div>
          </fieldset>

          <fieldset>
            <legend>Kdo akci uvidí</legend>
            <div className="planning-visibility-choice">
              <label><input type="radio" name="visibility" checked={form.visibility === "all"} onChange={() => setForm({ ...form, visibility: "all" })} /><span><strong>Všichni</strong><small>Akce se ukáže všem zaměstnancům.</small></span></label>
              <label><input type="radio" name="visibility" checked={form.visibility === "selected"} onChange={() => setForm({ ...form, visibility: "selected" })} /><span><strong>Jen vybraní</strong><small>Přiřazení lidé ji uvidí vždy.</small></span></label>
            </div>
            {form.visibility === "selected" && <div className="planning-people planning-viewers">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={selectedViewers.includes(profile.id)} onChange={() => toggleId(profile.id, setSelectedViewers)} /><i style={{ background: profile.calendar_color }} />{profile.full_name}</label>)}</div>}
          </fieldset>

          <button className="planning-primary" disabled={saving}>{saving ? "Ukládám…" : editingActionId ? "Uložit změny" : "Přidat akci"}</button>
        </form>

        <section className="planning-calendar-column">
          <section className="planning-panel">
            <div className="planning-calendar-toolbar"><div className="planning-nav"><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><button type="button" onClick={() => { const today = new Date(); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); selectDay(today); }}>Dnes</button><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div><h2>{visibleMonth.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</h2></div>
            <div className="planning-week">{weekDays.map((day) => <div key={day}>{day}</div>)}</div>
            <div className="planning-month">{calendarDays.map((date) => { const key = toDateKey(date); const items = actionsByDay.get(key) ?? []; const outside = date.getMonth() !== visibleMonth.getMonth(); return <button type="button" key={key} className={`${outside ? "outside" : ""} ${selectedDate === key ? "selected" : ""}`} onClick={() => selectDay(date)}><span className={key === todayKey ? "today" : ""}>{date.getDate()}</span><div>{items.slice(0, 6).map((item) => <i key={item.id} style={{ background: actionColor(item) }} title={`${item.title}: ${namesForAction(item.id) || "bez přiřazení"}`} />)}{items.length > 6 && <small>+{items.length - 6}</small>}</div></button>; })}</div>
          </section>

          <section className="planning-panel planning-agenda">
            <div className="planning-panel-head"><div><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}</h2><p>{dayActions.length} naplánovaných akcí</p></div></div>
            {loading ? <div className="planning-empty">Načítám…</div> : dayActions.length === 0 ? <div className="planning-empty">Na tento den zatím není nic naplánováno.</div> : <div className="planning-list">{dayActions.map((item) => <button type="button" className="planning-action-card" key={item.id} onClick={() => setSelectedAction(item)} aria-label={`Otevřít detail akce ${item.title}`}><i style={{ background: actionColor(item) }} /><div className="planning-time">{toTimeKey(item.starts_at)}<span>–</span>{toTimeKey(item.ends_at)}</div><div className="planning-action-summary"><span className="planning-tag" style={{ color: typeColors[item.action_type] }}>{typeLabels[item.action_type]}</span><h3>{item.title}</h3><p><strong>{actionElevator(item) || item.address || "Bez výtahu a adresy"}</strong></p><div className="planning-person-chips">{profilesForAction(item.id).map((profile) => <span key={profile.id}><i style={{ background: profile.calendar_color }} />{profile.full_name}</span>)}{profilesForAction(item.id).length === 0 && <em>Bez přiřazeného zaměstnance</em>}</div>{item.address && actionElevator(item) !== item.address && <p>{item.address}</p>}<span className="planning-open-detail">Zobrazit detail →</span></div></button>)}</div>}
          </section>
        </section>
      </section>

      {selectedAction && (
        <div className="planning-modal-backdrop" role="presentation" onMouseDown={() => setSelectedAction(null)}>
          <section className="planning-detail-modal" role="dialog" aria-modal="true" aria-labelledby="planning-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="planning-detail-head">
              <div><span className="planning-tag" style={{ color: typeColors[selectedAction.action_type] }}>{typeLabels[selectedAction.action_type]}</span><h2 id="planning-detail-title">{selectedAction.title}</h2><p>{statusLabels[selectedAction.status] ?? selectedAction.status}</p></div>
              <button type="button" onClick={() => setSelectedAction(null)} aria-label="Zavřít detail akce">×</button>
            </header>

            <div className="planning-detail-grid">
              <div><span>Datum a čas</span><strong>{new Date(selectedAction.starts_at).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><p>{toTimeKey(selectedAction.starts_at)} – {toTimeKey(selectedAction.ends_at)}</p></div>
              <div><span>Přiřazení</span><strong>{namesForAction(selectedAction.id) || "Bez přiřazeného zaměstnance"}</strong></div>
              <div><span>Viditelnost</span><strong>{viewersForAction(selectedAction)}</strong></div>
              <div><span>Výtah</span><strong>{actionElevator(selectedAction) || "Bez výtahu"}</strong></div>
              <div><span>Adresa</span><strong>{selectedAction.address || "Bez uvedené adresy"}</strong></div>
              <div><span>Kontakt</span><strong>{selectedAction.contact_name || "Bez kontaktu"}</strong>{selectedAction.contact_phone && <p>{selectedAction.contact_phone}</p>}</div>
            </div>

            <div className="planning-detail-note"><span>Poznámka</span><p>{noteFromDescription(selectedAction.description) || "K této akci není uložená žádná poznámka."}</p></div>

            <footer className="planning-detail-actions">
              {selectedAction.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAction.address)}`} target="_blank" rel="noreferrer">Otevřít navigaci</a>}
              {canManageAction(selectedAction) && <button type="button" className="edit" onClick={() => editAction(selectedAction)}>Upravit</button>}
              {canManageAction(selectedAction) && <button type="button" className="danger" onClick={() => void deleteAction(selectedAction)} disabled={deleting}>{deleting ? "Mažu…" : "Smazat"}</button>}
              <button type="button" onClick={() => setSelectedAction(null)}>Zavřít</button>
            </footer>
          </section>
        </div>
      )}

      <style jsx>{`
        .planning-page{min-height:100vh;margin-left:var(--sidebar-width);padding:30px 34px 60px;background:#f4f7f9;color:#142433}.planning-head,.planning-layout,.planning-notice{max-width:1500px;margin-left:auto;margin-right:auto}.planning-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.planning-head h1{margin:5px 0 6px;color:#082a49;font-size:38px;letter-spacing:-.04em}.planning-head p{margin:0;color:#718195}.planning-head a{padding:11px 15px;border:1px solid #d7e2e7;border-radius:11px;background:#fff;color:#326047;text-decoration:none;font-weight:850}.planning-eyebrow{color:#079447!important;font-size:11px;font-weight:950;letter-spacing:.12em}.planning-notice{margin-bottom:15px;padding:12px 14px;border-radius:11px;font-weight:800}.planning-notice.error{border:1px solid #efb8b8;background:#fff1f1;color:#a92b2b}.planning-notice.success{border:1px solid #b9dec6;background:#eef9f2;color:#08783d}.planning-layout{display:grid;grid-template-columns:minmax(330px,430px) minmax(0,1fr);gap:20px;align-items:start}.planning-panel{background:#fff;border:1px solid #dfe7ec;border-radius:18px;padding:20px;box-shadow:0 12px 34px rgba(16,37,54,.07)}.planning-form{position:sticky;top:20px}.planning-panel-head{display:flex;justify-content:space-between;gap:14px;margin-bottom:15px}.planning-panel h2{margin:0;color:#082a49;font-size:22px}.planning-panel-head p{margin:5px 0 0;color:#718195;font-size:13px}.planning-small-secondary{align-self:start;padding:8px 10px;border:1px solid #c9d7de;border-radius:9px;background:#f7fafb;color:#315064;font-weight:850;cursor:pointer}.planning-form label{position:relative;display:grid;gap:7px;margin-bottom:13px;color:#294052;font-size:13px;font-weight:850}.planning-form input,.planning-form select,.planning-form textarea{width:100%;box-sizing:border-box;border:1px solid #cbd8df;border-radius:11px;padding:10px 12px;background:#fff;color:#142433;font:inherit}.planning-form input,.planning-form select{min-height:44px}.planning-form textarea{resize:vertical}.planning-form small{color:#768696;font-weight:600}.planning-form-grid{display:grid;gap:12px}.planning-form-grid.two{grid-template-columns:1fr 1fr}.planning-form-grid.three{grid-template-columns:1.3fr 1fr 1fr}.planning-combobox{position:relative}.planning-suggestions{position:absolute;z-index:10;top:calc(100% + 5px);right:0;left:0;overflow:hidden;border:1px solid #d7e2e7;border-radius:12px;background:#fff;box-shadow:0 18px 45px rgba(16,37,54,.18)}.planning-suggestions button{width:100%;display:grid;gap:2px;padding:10px 12px;border:0;border-bottom:1px solid #edf1f3;background:#fff;text-align:left;cursor:pointer}.planning-suggestions button:hover{background:#eff8f3}.planning-suggestions span{color:#718195;font-size:12px}.planning-form fieldset{margin:3px 0 16px;padding:12px;border:1px solid #dce6eb;border-radius:12px}.planning-form legend{padding:0 5px;color:#294052;font-size:13px;font-weight:900}.planning-people{display:grid;grid-template-columns:1fr 1fr;gap:6px}.planning-people label{display:flex;align-items:center;gap:8px;margin:0;padding:8px;border-radius:9px;background:#f5f8fa;font-weight:700}.planning-people input{width:18px;min-height:18px}.planning-people label>i{width:10px;height:10px;flex:0 0 10px;border-radius:50%}.planning-viewers{margin-top:10px;padding-top:10px;border-top:1px solid #e0e8ec}.planning-visibility-choice{display:grid;grid-template-columns:1fr 1fr;gap:7px}.planning-visibility-choice label{display:flex;align-items:flex-start;gap:8px;margin:0;padding:10px;border:1px solid #dce6eb;border-radius:10px;background:#f8fafb}.planning-visibility-choice input{width:18px;min-height:18px}.planning-visibility-choice span{display:grid;gap:2px}.planning-primary{width:100%;min-height:46px;border:0;border-radius:11px;background:linear-gradient(135deg,#079447,#06783a);color:#fff;font-weight:950;cursor:pointer;box-shadow:0 10px 24px rgba(7,148,71,.2)}.planning-calendar-column{display:grid;gap:20px}.planning-calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:15px}.planning-calendar-toolbar h2{text-transform:capitalize}.planning-nav{display:flex;gap:7px}.planning-nav button{min-width:40px;height:40px;padding:0 12px;border:1px solid #d4e0e6;border-radius:10px;background:#fff;color:#315064;font-weight:900;cursor:pointer}.planning-week,.planning-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.planning-week{border:1px solid #e3eaee;border-bottom:0;border-radius:13px 13px 0 0;background:#f8fafb}.planning-week div{padding:9px 3px;color:#718195;text-align:center;font-size:11px;font-weight:950}.planning-month{overflow:hidden;border-top:1px solid #e3eaee;border-left:1px solid #e3eaee;border-radius:0 0 13px 13px}.planning-month button{min-height:88px;padding:7px;border:0;border-right:1px solid #e3eaee;border-bottom:1px solid #e3eaee;background:#fff;color:#142433;text-align:left;cursor:pointer}.planning-month button:hover{background:#f5faf7}.planning-month button.outside{background:#f8fafb;color:#a0adb7}.planning-month button.selected{box-shadow:inset 0 0 0 2px #079447;background:#eff9f3}.planning-month button>span{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;font-size:12px}.planning-month button>span.today{background:#079447;color:#fff;font-weight:900}.planning-month button>div{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:18px}.planning-month button i{width:10px;height:10px;border-radius:50%}.planning-month small{color:#718195;font-size:9px;font-weight:900}.planning-list{display:grid;gap:11px}.planning-action-card{position:relative;width:100%;display:grid;grid-template-columns:70px 1fr;gap:13px;padding:15px 15px 15px 21px;border:1px solid #d8e3e8;border-radius:14px;background:#fff;color:#142433;overflow:hidden;text-align:left;cursor:pointer;box-shadow:0 5px 14px rgba(16,37,54,.04);transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.planning-action-card:hover{border-color:#8fc3a3;box-shadow:0 12px 25px rgba(16,37,54,.1);transform:translateY(-1px)}.planning-action-card:focus-visible{outline:3px solid rgba(7,148,71,.2);border-color:#079447}.planning-action-card>i{position:absolute;inset:0 auto 0 0;width:5px}.planning-time{display:grid;align-content:start;color:#082a49;font-weight:950}.planning-time span{color:#91a0ac}.planning-action-summary{min-width:0}.planning-tag{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f1f5f7;font-size:11px;font-weight:900}.planning-list h3{margin:7px 0;color:#082a49}.planning-list p{margin:4px 0;color:#52697b;font-size:13px}.planning-person-chips{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.planning-person-chips span{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:#eef3f6;color:#315064;font-size:11px;font-weight:800}.planning-person-chips i{width:8px;height:8px;border-radius:50%}.planning-person-chips em{color:#718195;font-size:12px;font-style:normal}.planning-open-detail{display:inline-flex;margin-top:9px;color:#08783d;font-size:12px;font-weight:900}.planning-empty{padding:36px 18px;border:1px dashed #d5e0e5;border-radius:13px;background:#f8fafb;color:#718195;text-align:center}.planning-modal-backdrop{position:fixed;z-index:2200;inset:0;display:grid;place-items:center;padding:20px;background:rgba(3,18,30,.62)}.planning-detail-modal{width:min(760px,100%);max-height:92vh;overflow:auto;padding:24px;border:1px solid #c9d7de;border-radius:20px;background:#fff;color:#142433;box-shadow:0 30px 90px rgba(0,0,0,.3)}.planning-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:17px;border-bottom:1px solid #e0e8ec}.planning-detail-head h2{margin:8px 0 4px;color:#082a49;font-size:27px}.planning-detail-head p{margin:0;color:#52697b;font-size:13px;font-weight:800}.planning-detail-head>button{width:40px;height:40px;flex:0 0 auto;border:0;border-radius:50%;background:#edf3f6;color:#294052;font-size:25px;line-height:1;cursor:pointer}.planning-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:17px}.planning-detail-grid>div{min-width:0;padding:13px;border:1px solid #dbe5ea;border-radius:12px;background:#f8fafb}.planning-detail-grid span,.planning-detail-note>span{display:block;margin-bottom:6px;color:#52697b;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.planning-detail-grid strong{display:block;color:#17374d;line-height:1.45;overflow-wrap:anywhere}.planning-detail-grid p{margin:5px 0 0;color:#52697b}.planning-detail-note{margin-top:13px;padding:15px;border:1px solid #bcd8c7;border-radius:13px;background:#f0f8f3}.planning-detail-note p{margin:0;color:#17374d;line-height:1.55;white-space:pre-wrap}.planning-detail-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}.planning-detail-actions a,.planning-detail-actions button{min-height:42px;padding:0 15px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;font-weight:900;text-decoration:none;cursor:pointer}.planning-detail-actions a{border:1px solid #b9cbd5;background:#fff;color:#27506a}.planning-detail-actions button{border:0;background:#08783d;color:#fff}.planning-detail-actions button.edit{background:#32678a}.planning-detail-actions button.danger{background:#b63131}.planning-detail-actions button:disabled{opacity:.6;cursor:not-allowed}@media(max-width:1050px){.planning-layout{grid-template-columns:1fr}.planning-form{position:static}}@media(max-width:900px){.planning-page{margin-left:0;padding:78px 18px 40px}}@media(max-width:650px){.planning-page{padding-right:14px;padding-left:14px}.planning-head{align-items:flex-start;flex-direction:column}.planning-head h1{font-size:32px}.planning-form-grid.two,.planning-form-grid.three,.planning-people,.planning-detail-grid,.planning-visibility-choice{grid-template-columns:1fr}.planning-panel{padding:15px}.planning-calendar-toolbar{align-items:flex-start;flex-direction:column-reverse}.planning-month button{min-height:64px;padding:4px}.planning-month button>div{margin-top:8px;gap:3px}.planning-month button i{width:8px;height:8px}.planning-action-card{grid-template-columns:1fr}.planning-time{display:flex;gap:5px}.planning-modal-backdrop{padding:12px}.planning-detail-modal{padding:18px}.planning-detail-head h2{font-size:23px}.planning-detail-actions{display:grid}.planning-detail-actions a,.planning-detail-actions button{width:100%}}
      `}</style>
    </main>
  );
}
