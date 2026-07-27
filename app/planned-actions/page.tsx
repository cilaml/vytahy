"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; full_name: string; role: string; active: boolean };
type Elevator = { id: string; label: string; address: string };
type ActionRow = {
  id: string;
  title: string;
  action_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  address: string;
  description: string | null;
  elevator_id: string | null;
};
type Assignee = { planned_action_id: string; profile_id: string; is_lead: boolean };

const typeLabels: Record<string, string> = {
  servis: "Servis",
  porucha: "Porucha",
  montaz: "Montáž",
  oprava: "Oprava",
  op: "OP",
  oz: "OZ",
  ip: "IP",
  jine: "Jiné",
};

const typeColors: Record<string, string> = {
  servis: "#2563eb",
  porucha: "#dc2626",
  montaz: "#7c3aed",
  oprava: "#ea580c",
  op: "#16a34a",
  oz: "#059669",
  ip: "#0d9488",
  jine: "#64748b",
};

const weekDays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

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
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    action_type: "servis",
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
    load();
  }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setCurrentUserId(user.id);

    const [profilesResult, elevatorsResult, actionsResult, assigneesResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, role, active")
          .eq("active", true)
          .order("full_name"),
        supabase.from("elevators").select("id, label, address").order("address"),
        supabase
          .from("planned_actions")
          .select(
            "id, title, action_type, status, starts_at, ends_at, address, description, elevator_id"
          )
          .order("starts_at"),
        supabase
          .from("planned_action_assignees")
          .select("planned_action_id, profile_id, is_lead"),
      ]);

    const error =
      profilesResult.error ||
      elevatorsResult.error ||
      actionsResult.error ||
      assigneesResult.error;
    if (error) setMessage(`Načtení se nepovedlo: ${error.message}`);
    setProfiles(profilesResult.data ?? []);
    setElevators(elevatorsResult.data ?? []);
    setActions(actionsResult.data ?? []);
    setAssignees(assigneesResult.data ?? []);
    setLoading(false);
  }

  const actionsByDay = useMemo(() => {
    const grouped = new Map<string, ActionRow[]>();
    actions.forEach((item) => {
      const key = toDateKey(new Date(item.starts_at));
      const current = grouped.get(key) ?? [];
      current.push(item);
      grouped.set(key, current);
    });
    grouped.forEach((items) =>
      items.sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      )
    );
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

  const dayActions = actionsByDay.get(selectedDate) ?? [];

  function toggleAssignee(id: string) {
    setSelectedAssignees((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function chooseElevator(id: string) {
    const elevator = elevators.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      elevator_id: id,
      address: elevator?.address ?? current.address,
      title: current.title || elevator?.label || "",
    }));
  }

  function selectDay(date: Date) {
    const key = toDateKey(date);
    setSelectedDate(key);
    setForm((current) => ({ ...current, date: key }));
  }

  function changeMonth(offset: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function goToToday() {
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    selectDay(today);
  }

  async function createAction(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const startsAt = new Date(`${form.date}T${form.start}:00`).toISOString();
    const endsAt = new Date(`${form.date}T${form.end}:00`).toISOString();

    if (new Date(endsAt) <= new Date(startsAt)) {
      setMessage("Čas konce musí být později než čas začátku.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("planned_actions")
      .insert({
        title: form.title,
        action_type: form.action_type,
        starts_at: startsAt,
        ends_at: endsAt,
        address: form.address,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        description: form.description || null,
        elevator_id: form.elevator_id || null,
        created_by: currentUserId,
      })
      .select("id")
      .single();

    if (error || !data) {
      setMessage(
        `Akci se nepovedlo uložit: ${error?.message ?? "neznámá chyba"}`
      );
      setSaving(false);
      return;
    }

    if (selectedAssignees.length) {
      const { error: assigneeError } = await supabase
        .from("planned_action_assignees")
        .insert(
          selectedAssignees.map((profileId, index) => ({
            planned_action_id: data.id,
            profile_id: profileId,
            is_lead: index === 0,
          }))
        );
      if (assigneeError)
        setMessage(
          `Akce je uložená, ale přiřazení techniků selhalo: ${assigneeError.message}`
        );
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
    setSelectedAssignees([]);
    setSelectedDate(form.date);
    const createdDate = new Date(`${form.date}T12:00:00`);
    setVisibleMonth(
      new Date(createdDate.getFullYear(), createdDate.getMonth(), 1)
    );
    await load();
    setSaving(false);
  }

  function namesForAction(actionId: string) {
    return assignees
      .filter((item) => item.planned_action_id === actionId)
      .map(
        (item) =>
          profiles.find((profile) => profile.id === item.profile_id)?.full_name
      )
      .filter(Boolean)
      .join(", ");
  }

  return (
    <main className="shell">
      <header>
        <div>
          <a href="/dashboard">← Hlavní stránka</a>
          <h1>Plánované akce</h1>
          <p>Firemní plán práce pro servis, montáže, opravy a revize.</p>
        </div>
      </header>

      {message && <div className="message">{message}</div>}

      <section className="grid">
        <form className="card formCard" onSubmit={createAction}>
          <h2>Nová akce</h2>
          <label>
            Název
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Např. výměna rozvaděče"
            />
          </label>
          <div className="two">
            <label>
              Typ
              <select
                value={form.action_type}
                onChange={(e) =>
                  setForm({ ...form, action_type: e.target.value })
                }
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Výtah
              <select
                value={form.elevator_id}
                onChange={(e) => chooseElevator(e.target.value)}
              >
                <option value="">Bez vazby na výtah</option>
                {elevators.map((elevator) => (
                  <option key={elevator.id} value={elevator.id}>
                    {elevator.address} — {elevator.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="three">
            <label>
              Datum
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                  setSelectedDate(e.target.value);
                  const date = new Date(`${e.target.value}T12:00:00`);
                  setVisibleMonth(
                    new Date(date.getFullYear(), date.getMonth(), 1)
                  );
                }}
              />
            </label>
            <label>
              Od
              <input
                type="time"
                required
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </label>
            <label>
              Do
              <input
                type="time"
                required
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
          </div>
          <label>
            Adresa
            <input
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <div className="two">
            <label>
              Kontakt
              <input
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
              />
            </label>
            <label>
              Telefon
              <input
                value={form.contact_phone}
                onChange={(e) =>
                  setForm({ ...form, contact_phone: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Popis
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Přiřadit zaměstnance</legend>
            <div className="people">
              {profiles.map((profile) => (
                <label className="check" key={profile.id}>
                  <input
                    type="checkbox"
                    checked={selectedAssignees.includes(profile.id)}
                    onChange={() => toggleAssignee(profile.id)}
                  />
                  <span>{profile.full_name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={saving}>
            {saving ? "Ukládám..." : "Uložit akci"}
          </button>
        </form>

        <section className="calendarColumn">
          <section className="card calendarCard">
            <div className="calendarToolbar">
              <div className="calendarNav">
                <button type="button" className="secondary" onClick={goToToday}>
                  Dnes
                </button>
                <button
                  type="button"
                  className="iconButton"
                  aria-label="Předchozí měsíc"
                  onClick={() => changeMonth(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="iconButton"
                  aria-label="Další měsíc"
                  onClick={() => changeMonth(1)}
                >
                  ›
                </button>
              </div>
              <h2>
                {visibleMonth.toLocaleDateString("cs-CZ", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            <div className="legend">
              {Object.entries(typeLabels).map(([type, label]) => (
                <span key={type}>
                  <i style={{ backgroundColor: typeColors[type] }} />
                  {label}
                </span>
              ))}
            </div>

            <div className="weekHeader">
              {weekDays.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="monthGrid">
              {calendarDays.map((date) => {
                const key = toDateKey(date);
                const items = actionsByDay.get(key) ?? [];
                const inCurrentMonth =
                  date.getMonth() === visibleMonth.getMonth();
                const selected = key === selectedDate;
                const today = key === todayKey;

                return (
                  <button
                    type="button"
                    key={key}
                    className={`dayCell ${
                      inCurrentMonth ? "" : "outside"
                    } ${selected ? "selected" : ""}`}
                    onClick={() => selectDay(date)}
                    aria-label={`${date.toLocaleDateString("cs-CZ")}, ${
                      items.length
                    } akcí`}
                  >
                    <span className={today ? "dayNumber today" : "dayNumber"}>
                      {date.getDate()}
                    </span>
                    <div className="dots">
                      {items.slice(0, 4).map((item) => (
                        <i
                          key={item.id}
                          title={`${typeLabels[item.action_type] ?? item.action_type}: ${item.title}`}
                          style={{
                            backgroundColor:
                              typeColors[item.action_type] ?? typeColors.jine,
                          }}
                        />
                      ))}
                      {items.length > 4 && (
                        <span className="more">+{items.length - 4}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card dayCard">
            <div className="dayHead">
              <div>
                <h2>
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                    "cs-CZ",
                    { weekday: "long", day: "numeric", month: "long" }
                  )}
                </h2>
                <p>{dayActions.length} naplánovaných akcí</p>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const date = new Date(`${e.target.value}T12:00:00`);
                  setSelectedDate(e.target.value);
                  setVisibleMonth(
                    new Date(date.getFullYear(), date.getMonth(), 1)
                  );
                }}
              />
            </div>

            {loading ? (
              <p>Načítám...</p>
            ) : dayActions.length === 0 ? (
              <div className="empty">
                Na tento den zatím není nic naplánováno.
              </div>
            ) : (
              <div className="list">
                {dayActions.map((item) => (
                  <article key={item.id}>
                    <div
                      className="eventStripe"
                      style={{
                        backgroundColor:
                          typeColors[item.action_type] ?? typeColors.jine,
                      }}
                    />
                    <div className="time">
                      {new Date(item.starts_at).toLocaleTimeString("cs-CZ", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      –
                      {new Date(item.ends_at).toLocaleTimeString("cs-CZ", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div>
                      <span
                        className="tag"
                        style={{
                          color:
                            typeColors[item.action_type] ?? typeColors.jine,
                        }}
                      >
                        {typeLabels[item.action_type] ?? item.action_type}
                      </span>
                      <h3>{item.title}</h3>
                      <p>
                        <strong>{item.address}</strong>
                      </p>
                      <p>
                        {namesForAction(item.id) ||
                          "Bez přiřazeného zaměstnance"}
                      </p>
                      {item.description && <p>{item.description}</p>}
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          item.address
                        )}`}
                      >
                        Otevřít navigaci
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>

      <style jsx>{`
        .shell{min-height:100vh;background:#f3f6f8;padding:28px;color:#10202a;font-family:Arial,sans-serif}.shell>header,.grid{max-width:1500px;margin:0 auto}.shell>header{margin-bottom:22px}h1{font-size:34px;margin:8px 0 4px}h2{margin:0}p{color:#52636e}a{color:#086b4d;font-weight:800;text-decoration:none}.grid{display:grid;grid-template-columns:minmax(350px,480px) minmax(0,1fr);gap:22px;align-items:start}.calendarColumn{display:grid;gap:22px}.card{background:white;border-radius:18px;padding:22px;box-shadow:0 12px 35px rgba(16,32,42,.08)}.formCard{position:sticky;top:20px}label{display:grid;gap:7px;font-weight:800;margin-bottom:14px}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5db;border-radius:10px;padding:11px 12px;font:inherit;background:white}.two,.three{display:grid;grid-template-columns:1fr 1fr;gap:12px}.three{grid-template-columns:1.4fr 1fr 1fr}fieldset{border:1px solid #d9e0e4;border-radius:12px;margin:4px 0 16px}legend{font-weight:900}.people{display:grid;grid-template-columns:1fr 1fr;gap:6px}.check{display:flex;align-items:center;gap:8px;margin:0;font-weight:600}.check input{width:auto}button{border:0;border-radius:12px;padding:13px 18px;background:#087552;color:white;font-weight:900;font-size:16px;cursor:pointer}.message{max-width:1500px;margin:0 auto 16px;background:#fff4d6;border:1px solid #e8c86c;padding:12px 14px;border-radius:12px}.calendarToolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}.calendarToolbar h2{text-transform:capitalize}.calendarNav{display:flex;align-items:center;gap:8px}.secondary,.iconButton{background:white;color:#334155;border:1px solid #cbd5e1}.secondary{padding:10px 16px}.iconButton{width:42px;height:42px;padding:0;font-size:28px;line-height:1}.legend{display:flex;gap:10px 16px;flex-wrap:wrap;padding:10px 0 16px;color:#52636e;font-size:12px;font-weight:800}.legend span{display:flex;align-items:center;gap:6px}.legend i{width:9px;height:9px;border-radius:50%}.weekHeader,.monthGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.weekHeader{border:1px solid #e2e8f0;border-bottom:0;border-radius:14px 14px 0 0;overflow:hidden;background:#f8fafc}.weekHeader div{text-align:center;padding:10px 4px;color:#64748b;font-size:12px;font-weight:900}.monthGrid{border-left:1px solid #e2e8f0;border-top:1px solid #e2e8f0}.dayCell{min-width:0;min-height:105px;background:white;color:#0f172a;border-radius:0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:8px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;box-shadow:none}.dayCell:hover{background:#f8fafc}.dayCell.outside{background:#f8fafc;color:#94a3b8}.dayCell.selected{box-shadow:inset 0 0 0 2px #087552;background:#effaf6}.dayNumber{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;font-size:13px}.dayNumber.today{background:#087552;color:white}.dots{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:auto;padding-top:10px}.dots i{width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 2px white}.more{font-size:11px;color:#64748b;font-weight:900}.dayHead{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}.dayHead h2{text-transform:capitalize}.dayHead p{margin:5px 0 0}.dayHead input{width:auto}.list{display:grid;gap:12px}article{position:relative;display:grid;grid-template-columns:95px 1fr;gap:16px;padding:16px 16px 16px 22px;border:1px solid #dfe6e9;border-radius:14px;overflow:hidden}.eventStripe{position:absolute;left:0;top:0;bottom:0;width:6px}.time{font-size:16px;font-weight:950}.tag{display:inline-block;background:#f1f5f9;padding:5px 8px;border-radius:999px;font-size:12px;font-weight:900}h3{margin:8px 0}article p{margin:5px 0}.empty{padding:40px 20px;text-align:center;background:#f7f9fa;border-radius:12px;color:#667780}@media(max-width:1050px){.grid{grid-template-columns:1fr}.formCard{position:static}}@media(max-width:700px){.shell{padding:14px}.card{padding:15px;border-radius:15px}.two,.three{grid-template-columns:1fr}.people{grid-template-columns:1fr}.calendarToolbar{align-items:flex-start;flex-direction:column-reverse}.calendarToolbar h2{font-size:23px}.legend{display:none}.weekHeader div{padding:8px 2px}.dayCell{min-height:68px;padding:5px}.dayNumber{width:25px;height:25px}.dots{gap:3px;padding-top:5px}.dots i{width:8px;height:8px}.more{font-size:9px}article{grid-template-columns:1fr}.dayHead{align-items:flex-end}.dayHead h2{font-size:22px}}
      `}</style>
    </main>
  );
}
