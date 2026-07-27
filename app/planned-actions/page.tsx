"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; full_name: string; role: string; active: boolean };
type Elevator = { id: string; label: string; address: string };
type ActionType = "servis" | "porucha" | "montaz" | "oprava" | "op" | "oz" | "ip" | "jine";
type ActionRow = {
  id: string;
  title: string;
  action_type: ActionType;
  status: string;
  starts_at: string;
  ends_at: string;
  address: string;
  description: string | null;
  elevator_id: string | null;
};
type Assignee = { planned_action_id: string; profile_id: string; is_lead: boolean };

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

const weekDays = ["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"];

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export default function PlannedActionsPage() {
  const todayKey = toDateKey(new Date());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [elevatorQuery, setElevatorQuery] = useState("");
  const [form, setForm] = useState({
    title: "",
    action_type: "servis" as ActionType,
    date: todayKey,
    start: "08:00",
    end: "10:00",
    address: "",
    elevator_id: "",
    contact_name: "",
    contact_phone: "",
    description: "",
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = "/login";
      return;
    }
    setCurrentUserId(authData.user.id);

    const [profilesResult, elevatorsResult, actionsResult, assigneesResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,role,active").eq("active", true).order("full_name"),
      supabase.from("elevators").select("id,label,address").eq("status", "aktivni").order("address"),
      supabase.from("planned_actions").select("id,title,action_type,status,starts_at,ends_at,address,description,elevator_id").order("starts_at"),
      supabase.from("planned_action_assignees").select("planned_action_id,profile_id,is_lead"),
    ]);

    const error = profilesResult.error || elevatorsResult.error || actionsResult.error || assigneesResult.error;
    if (error) setMessage(`Načtení se nepovedlo: ${error.message}`);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setActions((actionsResult.data ?? []) as ActionRow[]);
    setAssignees((assigneesResult.data ?? []) as Assignee[]);
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

  function toggleAssignee(id: string) {
    setSelectedAssignees((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
    setForm((current) => ({ ...current, date: key }));
  }

  async function createAction(event: FormEvent) {
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

    const supabase = createClient();
    const { data, error } = await supabase
      .from("planned_actions")
      .insert({
        title: form.title.trim(),
        action_type: form.action_type,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        address: form.address.trim() || customElevator,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        description: description || null,
        elevator_id: form.elevator_id || null,
        created_by: currentUserId,
      })
      .select("id")
      .single();

    if (error || !data) {
      setMessage(`Akci se nepovedlo uložit: ${error?.message ?? "neznámá chyba"}`);
      setSaving(false);
      return;
    }

    if (selectedAssignees.length > 0) {
      const { error: assigneeError } = await supabase.from("planned_action_assignees").insert(
        selectedAssignees.map((profileId, index) => ({
          planned_action_id: data.id,
          profile_id: profileId,
          is_lead: index === 0,
        }))
      );
      if (assigneeError) setMessage(`Akce je uložená, ale přiřazení selhalo: ${assigneeError.message}`);
    }

    setForm((current) => ({
      ...current,
      title: "",
      address: "",
      elevator_id: "",
      contact_name: "",
      contact_phone: "",
      description: "",
    }));
    setElevatorQuery("");
    setSelectedAssignees([]);
    setSelectedDate(form.date);
    const createdDate = new Date(`${form.date}T12:00:00`);
    setVisibleMonth(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
    setSuccess("Akce byla přidána do kalendáře.");
    await load();
    setSaving(false);
  }

  function namesForAction(actionId: string) {
    return assignees
      .filter((item) => item.planned_action_id === actionId)
      .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
      .map((item) => profiles.find((profile) => profile.id === item.profile_id)?.full_name)
      .filter(Boolean)
      .join(", ");
  }

  function actionElevator(action: ActionRow) {
    const stored = elevators.find((item) => item.id === action.elevator_id);
    return stored ? `${stored.address} — ${stored.label}` : customElevatorFromDescription(action.description);
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
        <form className="planning-panel planning-form" onSubmit={createAction}>
          <div className="planning-panel-head"><div><h2>Nová akce</h2><p>Výtah lze vyhledat, napsat ručně nebo úplně vynechat.</p></div></div>

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

          <fieldset><legend>Přiřazení zaměstnanců – volitelné</legend><div className="planning-people">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={selectedAssignees.includes(profile.id)} onChange={() => toggleAssignee(profile.id)} />{profile.full_name}</label>)}</div></fieldset>
          <button className="planning-primary" disabled={saving}>{saving ? "Ukládám…" : "Přidat akci"}</button>
        </form>

        <section className="planning-calendar-column">
          <section className="planning-panel">
            <div className="planning-calendar-toolbar"><div className="planning-nav"><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><button type="button" onClick={() => { const today = new Date(); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); selectDay(today); }}>Dnes</button><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div><h2>{visibleMonth.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</h2></div>
            <div className="planning-week">{weekDays.map((day) => <div key={day}>{day}</div>)}</div>
            <div className="planning-month">{calendarDays.map((date) => { const key = toDateKey(date); const items = actionsByDay.get(key) ?? []; const outside = date.getMonth() !== visibleMonth.getMonth(); return <button type="button" key={key} className={`${outside ? "outside" : ""} ${selectedDate === key ? "selected" : ""}`} onClick={() => selectDay(date)}><span className={key === todayKey ? "today" : ""}>{date.getDate()}</span><div>{items.slice(0, 4).map((item) => <i key={item.id} style={{ background: typeColors[item.action_type] }} />)}{items.length > 4 && <small>+{items.length - 4}</small>}</div></button>; })}</div>
          </section>

          <section className="planning-panel planning-agenda">
            <div className="planning-panel-head"><div><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}</h2><p>{dayActions.length} naplánovaných akcí</p></div></div>
            {loading ? <div className="planning-empty">Načítám…</div> : dayActions.length === 0 ? <div className="planning-empty">Na tento den zatím není nic naplánováno.</div> : <div className="planning-list">{dayActions.map((item) => <article key={item.id}><i style={{ background: typeColors[item.action_type] }} /><div className="planning-time">{new Date(item.starts_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}<span>–</span>{new Date(item.ends_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div><div><span className="planning-tag" style={{ color: typeColors[item.action_type] }}>{typeLabels[item.action_type]}</span><h3>{item.title}</h3><p><strong>{actionElevator(item) || item.address || "Bez výtahu a adresy"}</strong></p><p>{namesForAction(item.id) || "Bez přiřazeného zaměstnance"}</p>{item.address && actionElevator(item) !== item.address && <p>{item.address}</p>}</div></article>)}</div>}
          </section>
        </section>
      </section>

      <style jsx>{`
        .planning-page{min-height:100vh;margin-left:var(--sidebar-width);padding:30px 34px 60px;background:#f4f7f9;color:#142433}.planning-head,.planning-layout,.planning-notice{max-width:1500px;margin-left:auto;margin-right:auto}.planning-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.planning-head h1{margin:5px 0 6px;color:#082a49;font-size:38px;letter-spacing:-.04em}.planning-head p{margin:0;color:#718195}.planning-head a{padding:11px 15px;border:1px solid #d7e2e7;border-radius:11px;background:#fff;color:#326047;text-decoration:none;font-weight:850}.planning-eyebrow{color:#079447!important;font-size:11px;font-weight:950;letter-spacing:.12em}.planning-notice{margin-bottom:15px;padding:12px 14px;border-radius:11px;font-weight:800}.planning-notice.error{border:1px solid #efb8b8;background:#fff1f1;color:#a92b2b}.planning-notice.success{border:1px solid #b9dec6;background:#eef9f2;color:#08783d}.planning-layout{display:grid;grid-template-columns:minmax(330px,430px) minmax(0,1fr);gap:20px;align-items:start}.planning-panel{background:#fff;border:1px solid #dfe7ec;border-radius:18px;padding:20px;box-shadow:0 12px 34px rgba(16,37,54,.07)}.planning-form{position:sticky;top:20px}.planning-panel-head{display:flex;justify-content:space-between;gap:14px;margin-bottom:15px}.planning-panel h2{margin:0;color:#082a49;font-size:22px}.planning-panel-head p{margin:5px 0 0;color:#718195;font-size:13px}.planning-form label{position:relative;display:grid;gap:7px;margin-bottom:13px;color:#294052;font-size:13px;font-weight:850}.planning-form input,.planning-form select,.planning-form textarea{width:100%;box-sizing:border-box;border:1px solid #cbd8df;border-radius:11px;padding:10px 12px;background:#fff;color:#142433;font:inherit}.planning-form input,.planning-form select{min-height:44px}.planning-form textarea{resize:vertical}.planning-form small{color:#768696;font-weight:600}.planning-form-grid{display:grid;gap:12px}.planning-form-grid.two{grid-template-columns:1fr 1fr}.planning-form-grid.three{grid-template-columns:1.3fr 1fr 1fr}.planning-combobox{position:relative}.planning-suggestions{position:absolute;z-index:10;top:calc(100% + 5px);right:0;left:0;overflow:hidden;border:1px solid #d7e2e7;border-radius:12px;background:#fff;box-shadow:0 18px 45px rgba(16,37,54,.18)}.planning-suggestions button{width:100%;display:grid;gap:2px;padding:10px 12px;border:0;border-bottom:1px solid #edf1f3;background:#fff;text-align:left;cursor:pointer}.planning-suggestions button:hover{background:#eff8f3}.planning-suggestions span{color:#718195;font-size:12px}.planning-form fieldset{margin:3px 0 16px;padding:12px;border:1px solid #dce6eb;border-radius:12px}.planning-form legend{padding:0 5px;color:#294052;font-size:13px;font-weight:900}.planning-people{display:grid;grid-template-columns:1fr 1fr;gap:6px}.planning-people label{display:flex;align-items:center;gap:8px;margin:0;padding:8px;border-radius:9px;background:#f5f8fa;font-weight:700}.planning-people input{width:auto;min-height:auto}.planning-primary{width:100%;min-height:46px;border:0;border-radius:11px;background:linear-gradient(135deg,#079447,#06783a);color:#fff;font-weight:950;cursor:pointer;box-shadow:0 10px 24px rgba(7,148,71,.2)}.planning-calendar-column{display:grid;gap:20px}.planning-calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:15px}.planning-calendar-toolbar h2{text-transform:capitalize}.planning-nav{display:flex;gap:7px}.planning-nav button{min-width:40px;height:40px;padding:0 12px;border:1px solid #d4e0e6;border-radius:10px;background:#fff;color:#315064;font-weight:900;cursor:pointer}.planning-week,.planning-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.planning-week{border:1px solid #e3eaee;border-bottom:0;border-radius:13px 13px 0 0;background:#f8fafb}.planning-week div{padding:9px 3px;color:#718195;text-align:center;font-size:11px;font-weight:950}.planning-month{overflow:hidden;border-top:1px solid #e3eaee;border-left:1px solid #e3eaee;border-radius:0 0 13px 13px}.planning-month button{min-height:88px;padding:7px;border:0;border-right:1px solid #e3eaee;border-bottom:1px solid #e3eaee;background:#fff;color:#142433;text-align:left;cursor:pointer}.planning-month button:hover{background:#f5faf7}.planning-month button.outside{background:#f8fafb;color:#a0adb7}.planning-month button.selected{box-shadow:inset 0 0 0 2px #079447;background:#eff9f3}.planning-month button>span{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;font-size:12px}.planning-month button>span.today{background:#079447;color:#fff;font-weight:900}.planning-month button>div{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:18px}.planning-month i{width:8px;height:8px;border-radius:50%}.planning-month small{color:#718195;font-size:9px;font-weight:900}.planning-list{display:grid;gap:11px}.planning-list article{position:relative;display:grid;grid-template-columns:70px 1fr;gap:13px;padding:15px 15px 15px 21px;border:1px solid #e0e8ec;border-radius:14px;background:#fff;overflow:hidden}.planning-list article>i{position:absolute;inset:0 auto 0 0;width:5px}.planning-time{display:grid;align-content:start;color:#082a49;font-weight:950}.planning-time span{color:#91a0ac}.planning-tag{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f1f5f7;font-size:11px;font-weight:900}.planning-list h3{margin:7px 0;color:#082a49}.planning-list p{margin:4px 0;color:#687b8a;font-size:13px}.planning-empty{padding:36px 18px;border:1px dashed #d5e0e5;border-radius:13px;background:#f8fafb;color:#718195;text-align:center}@media(max-width:1050px){.planning-layout{grid-template-columns:1fr}.planning-form{position:static}}@media(max-width:900px){.planning-page{margin-left:0;padding:78px 18px 40px}}@media(max-width:650px){.planning-page{padding-right:14px;padding-left:14px}.planning-head{align-items:flex-start;flex-direction:column}.planning-head h1{font-size:32px}.planning-form-grid.two,.planning-form-grid.three,.planning-people{grid-template-columns:1fr}.planning-panel{padding:15px}.planning-calendar-toolbar{align-items:flex-start;flex-direction:column-reverse}.planning-month button{min-height:64px;padding:4px}.planning-month button>div{margin-top:8px;gap:3px}.planning-month i{width:7px;height:7px}.planning-list article{grid-template-columns:1fr}.planning-time{display:flex;gap:5px}}
      `}</style>
    </main>
  );
}
