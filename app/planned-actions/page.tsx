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

export default function PlannedActionsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    action_type: "servis",
    date: new Date().toISOString().slice(0, 10),
    start: "08:00",
    end: "10:00",
    address: "",
    elevator_id: "",
    contact_name: "",
    contact_phone: "",
    description: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    setCurrentUserId(user.id);

    const [profilesResult, elevatorsResult, actionsResult, assigneesResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, active").eq("active", true).order("full_name"),
      supabase.from("elevators").select("id, label, address").order("address"),
      supabase.from("planned_actions").select("id, title, action_type, status, starts_at, ends_at, address, description, elevator_id").order("starts_at"),
      supabase.from("planned_action_assignees").select("planned_action_id, profile_id, is_lead"),
    ]);

    const error = profilesResult.error || elevatorsResult.error || actionsResult.error || assigneesResult.error;
    if (error) setMessage(`Načtení se nepovedlo: ${error.message}`);
    setProfiles(profilesResult.data ?? []);
    setElevators(elevatorsResult.data ?? []);
    setActions(actionsResult.data ?? []);
    setAssignees(assigneesResult.data ?? []);
    setLoading(false);
  }

  const dayActions = useMemo(() => actions.filter((item) => item.starts_at.slice(0, 10) === selectedDate), [actions, selectedDate]);

  function toggleAssignee(id: string) {
    setSelectedAssignees((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  function chooseElevator(id: string) {
    const elevator = elevators.find((item) => item.id === id);
    setForm((current) => ({ ...current, elevator_id: id, address: elevator?.address ?? current.address, title: current.title || elevator?.label || "" }));
  }

  async function createAction(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const startsAt = new Date(`${form.date}T${form.start}:00`).toISOString();
    const endsAt = new Date(`${form.date}T${form.end}:00`).toISOString();

    const { data, error } = await supabase.from("planned_actions").insert({
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
    }).select("id").single();

    if (error || !data) {
      setMessage(`Akci se nepovedlo uložit: ${error?.message ?? "neznámá chyba"}`);
      setSaving(false);
      return;
    }

    if (selectedAssignees.length) {
      const { error: assigneeError } = await supabase.from("planned_action_assignees").insert(
        selectedAssignees.map((profileId, index) => ({ planned_action_id: data.id, profile_id: profileId, is_lead: index === 0 }))
      );
      if (assigneeError) setMessage(`Akce je uložená, ale přiřazení techniků selhalo: ${assigneeError.message}`);
    }

    setForm((current) => ({ ...current, title: "", address: "", elevator_id: "", contact_name: "", contact_phone: "", description: "" }));
    setSelectedAssignees([]);
    setSelectedDate(form.date);
    await load();
    setSaving(false);
  }

  function namesForAction(actionId: string) {
    return assignees.filter((item) => item.planned_action_id === actionId).map((item) => profiles.find((profile) => profile.id === item.profile_id)?.full_name).filter(Boolean).join(", ");
  }

  return (
    <main className="shell">
      <header><div><a href="/dashboard">← Hlavní stránka</a><h1>Plánované akce</h1><p>Firemní plán práce pro servis, montáže, opravy a revize.</p></div></header>
      {message && <div className="message">{message}</div>}
      <section className="grid">
        <form className="card" onSubmit={createAction}>
          <h2>Nová akce</h2>
          <label>Název<input required value={form.title} onChange={(e) => setForm({...form, title:e.target.value})} placeholder="Např. výměna rozvaděče" /></label>
          <div className="two"><label>Typ<select value={form.action_type} onChange={(e)=>setForm({...form,action_type:e.target.value})}>{Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Výtah<select value={form.elevator_id} onChange={(e)=>chooseElevator(e.target.value)}><option value="">Bez vazby na výtah</option>{elevators.map((e)=><option key={e.id} value={e.id}>{e.address} — {e.label}</option>)}</select></label></div>
          <div className="three"><label>Datum<input type="date" required value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/></label><label>Od<input type="time" required value={form.start} onChange={(e)=>setForm({...form,start:e.target.value})}/></label><label>Do<input type="time" required value={form.end} onChange={(e)=>setForm({...form,end:e.target.value})}/></label></div>
          <label>Adresa<input required value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})}/></label>
          <div className="two"><label>Kontakt<input value={form.contact_name} onChange={(e)=>setForm({...form,contact_name:e.target.value})}/></label><label>Telefon<input value={form.contact_phone} onChange={(e)=>setForm({...form,contact_phone:e.target.value})}/></label></div>
          <label>Popis<textarea rows={4} value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
          <fieldset><legend>Přiřadit zaměstnance</legend><div className="people">{profiles.map((p)=><label className="check" key={p.id}><input type="checkbox" checked={selectedAssignees.includes(p.id)} onChange={()=>toggleAssignee(p.id)}/><span>{p.full_name}</span></label>)}</div></fieldset>
          <button disabled={saving}>{saving ? "Ukládám..." : "Uložit akci"}</button>
        </form>

        <section className="card">
          <div className="dayHead"><div><h2>Denní plán</h2><p>{dayActions.length} akcí</p></div><input type="date" value={selectedDate} onChange={(e)=>setSelectedDate(e.target.value)}/></div>
          {loading ? <p>Načítám...</p> : dayActions.length === 0 ? <div className="empty">Na tento den zatím není nic naplánováno.</div> : <div className="list">{dayActions.map((item)=><article key={item.id}><div className="time">{new Date(item.starts_at).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}–{new Date(item.ends_at).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}</div><div><span className="tag">{typeLabels[item.action_type] ?? item.action_type}</span><h3>{item.title}</h3><p><strong>{item.address}</strong></p><p>{namesForAction(item.id) || "Bez přiřazeného zaměstnance"}</p>{item.description && <p>{item.description}</p>}<a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`}>Otevřít navigaci</a></div></article>)}</div>}
        </section>
      </section>
      <style jsx>{`
        .shell{min-height:100vh;background:#f3f6f8;padding:28px;color:#10202a;font-family:Arial,sans-serif}.shell>header,.grid{max-width:1400px;margin:0 auto}.shell>header{margin-bottom:22px}h1{font-size:34px;margin:8px 0 4px}h2{margin-top:0}p{color:#52636e}a{color:#086b4d;font-weight:800;text-decoration:none}.grid{display:grid;grid-template-columns:minmax(360px,520px) 1fr;gap:22px}.card{background:white;border-radius:18px;padding:22px;box-shadow:0 12px 35px rgba(16,32,42,.08)}label{display:grid;gap:7px;font-weight:800;margin-bottom:14px}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5db;border-radius:10px;padding:11px 12px;font:inherit;background:white}.two,.three{display:grid;grid-template-columns:1fr 1fr;gap:12px}.three{grid-template-columns:1.4fr 1fr 1fr}fieldset{border:1px solid #d9e0e4;border-radius:12px;margin:4px 0 16px}legend{font-weight:900}.people{display:grid;grid-template-columns:1fr 1fr;gap:6px}.check{display:flex;align-items:center;gap:8px;margin:0;font-weight:600}.check input{width:auto}button{border:0;border-radius:12px;padding:13px 18px;background:#087552;color:white;font-weight:900;font-size:16px;cursor:pointer}.message{max-width:1400px;margin:0 auto 16px;background:#fff4d6;border:1px solid #e8c86c;padding:12px 14px;border-radius:12px}.dayHead{display:flex;justify-content:space-between;gap:16px;align-items:center}.dayHead input{width:auto}.list{display:grid;gap:12px}article{display:grid;grid-template-columns:95px 1fr;gap:16px;padding:16px;border:1px solid #dfe6e9;border-radius:14px}.time{font-size:16px;font-weight:950}.tag{display:inline-block;background:#e4f4ed;color:#086b4d;padding:5px 8px;border-radius:999px;font-size:12px;font-weight:900}h3{margin:8px 0}article p{margin:5px 0}.empty{padding:40px 20px;text-align:center;background:#f7f9fa;border-radius:12px;color:#667780}@media(max-width:900px){.shell{padding:16px}.grid{grid-template-columns:1fr}.two,.three{grid-template-columns:1fr}.people{grid-template-columns:1fr}article{grid-template-columns:1fr}.dayHead{align-items:flex-end}}
      `}</style>
    </main>
  );
}
