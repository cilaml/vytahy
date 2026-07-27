"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  primary_region_id: string | null;
};

type NotificationItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  tone: "green" | "blue" | "red" | "purple";
};

type Elevator = { id: string; address: string; label: string };
type Employee = { id: string; full_name: string; active: boolean };

const roleLabels: Record<string, string> = {
  admin: "Administrátor",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const actionTypes = [
  ["servis", "Servis"],
  ["porucha", "Porucha"],
  ["montaz", "Montáž"],
  ["oprava", "Oprava"],
  ["op", "OP"],
  ["oz", "OZ"],
  ["ip", "IP"],
  ["jine", "Jiné"],
] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "U";
}

export default function GlobalChrome() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [elevatorQuery, setElevatorQuery] = useState("");
  const [selectedElevatorId, setSelectedElevatorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    action_type: "servis",
    date: dateKey(new Date()),
    start: "08:00",
    end: "10:00",
    address: "",
    description: "",
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  async function loadNotifications() {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const [profileResult, actionAssigneesResult, faultAssigneesResult, actionsResult, faultsResult, messagesResult, regionsResult] =
      await Promise.all([
        supabase.from("profiles").select("id,email,full_name,role,primary_region_id").eq("id", user.id).maybeSingle(),
        supabase.from("planned_action_assignees").select("planned_action_id,is_lead").eq("profile_id", user.id),
        supabase.from("fault_assignees").select("fault_id,role").eq("profile_id", user.id),
        supabase.from("planned_actions").select("id,title,starts_at,address,status").neq("status", "zruseno").order("starts_at", { ascending: false }).limit(100),
        supabase.from("faults").select("id,description,status,priority,main_technician_id,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("messages").select("id,title,body,target_type,target_role,target_profile_id,target_region_id,created_at").order("created_at", { ascending: false }).limit(60),
        supabase.from("profile_regions").select("region_id").eq("profile_id", user.id),
      ]);

    if (!profileResult.data) return;
    const currentProfile = profileResult.data as Profile;
    setProfile(currentProfile);

    const assignedActionIds = new Set((actionAssigneesResult.data ?? []).map((item) => item.planned_action_id));
    const assignedFaultIds = new Set((faultAssigneesResult.data ?? []).map((item) => item.fault_id));
    const regionIds = new Set([
      currentProfile.primary_region_id,
      ...(regionsResult.data ?? []).map((item) => item.region_id),
    ].filter(Boolean));

    const items: NotificationItem[] = [];

    for (const action of actionsResult.data ?? []) {
      if (!assignedActionIds.has(action.id)) continue;
      items.push({
        key: `action:${action.id}`,
        title: `Přiřazená práce: ${action.title}`,
        detail: `${new Date(action.starts_at).toLocaleString("cs-CZ")} · ${action.address || "bez adresy"}`,
        href: "/planned-actions",
        createdAt: action.starts_at,
        tone: "blue",
      });
    }

    for (const fault of faultsResult.data ?? []) {
      if (fault.main_technician_id !== user.id && !assignedFaultIds.has(fault.id)) continue;
      if (["hotovo", "archivovano"].includes(fault.status)) continue;
      items.push({
        key: `fault:${fault.id}`,
        title: fault.priority === "uvizle_osoby" ? "Uvízlé osoby" : "Přiřazená porucha",
        detail: fault.description || "Porucha bez popisu",
        href: "/faults",
        createdAt: fault.created_at,
        tone: "red",
      });
    }

    for (const message of messagesResult.data ?? []) {
      const visible =
        message.target_type === "all" ||
        (message.target_type === "role" && message.target_role === currentProfile.role) ||
        (message.target_type === "profile" && message.target_profile_id === user.id) ||
        (message.target_type === "region" && regionIds.has(message.target_region_id));
      if (!visible) continue;
      items.push({
        key: `message:${message.id}`,
        title: message.title,
        detail: message.body,
        href: "/messages",
        createdAt: message.created_at,
        tone: "purple",
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotifications(items.slice(0, 30));

    const storageKey = `vd-read-notifications-${user.id}`;
    try {
      setReadKeys(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
    } catch {
      setReadKeys([]);
    }
  }

  const unreadCount = notifications.filter((item) => !readKeys.includes(item.key)).length;

  function markRead(item: NotificationItem) {
    if (!profile) return;
    const next = Array.from(new Set([...readKeys, item.key]));
    setReadKeys(next);
    window.localStorage.setItem(`vd-read-notifications-${profile.id}`, JSON.stringify(next));
    window.location.href = item.href;
  }

  function markAllRead() {
    if (!profile) return;
    const next = notifications.map((item) => item.key);
    setReadKeys(next);
    window.localStorage.setItem(`vd-read-notifications-${profile.id}`, JSON.stringify(next));
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function openActionModal() {
    setActionOpen(true);
    setActionMessage("");
    const supabase = createClient();
    const [elevatorResult, employeeResult] = await Promise.all([
      supabase.from("elevators").select("id,address,label").eq("status", "aktivni").order("address"),
      supabase.from("profiles").select("id,full_name,active").eq("active", true).order("full_name"),
    ]);
    setElevators((elevatorResult.data ?? []) as Elevator[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
  }

  const elevatorSuggestions = useMemo(() => {
    const query = elevatorQuery.trim().toLocaleLowerCase("cs-CZ");
    if (!query || selectedElevatorId) return [];
    return elevators
      .filter((item) => `${item.address} ${item.label}`.toLocaleLowerCase("cs-CZ").includes(query))
      .slice(0, 8);
  }, [elevators, elevatorQuery, selectedElevatorId]);

  function chooseElevator(elevator: Elevator) {
    setSelectedElevatorId(elevator.id);
    setElevatorQuery(`${elevator.address} — ${elevator.label}`);
    setForm((current) => ({ ...current, address: current.address || elevator.address }));
  }

  async function saveAction(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionMessage("");
    const startsAt = new Date(`${form.date}T${form.start}:00`);
    const endsAt = new Date(`${form.date}T${form.end}:00`);
    if (endsAt <= startsAt) {
      setActionMessage("Čas konce musí být později než začátek.");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const customElevatorText = !selectedElevatorId ? elevatorQuery.trim() : "";
    const address = form.address.trim() || customElevatorText;
    const description = [customElevatorText ? `Výtah mimo databázi: ${customElevatorText}` : "", form.description.trim()]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await supabase
      .from("planned_actions")
      .insert({
        title: form.title.trim(),
        action_type: form.action_type,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        address,
        description: description || null,
        elevator_id: selectedElevatorId || null,
        created_by: profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setActionMessage(`Akci se nepovedlo uložit: ${error?.message ?? "neznámá chyba"}`);
      setSaving(false);
      return;
    }

    if (selectedEmployees.length > 0) {
      const { error: assigneeError } = await supabase.from("planned_action_assignees").insert(
        selectedEmployees.map((profileId, index) => ({
          planned_action_id: data.id,
          profile_id: profileId,
          is_lead: index === 0,
        }))
      );
      if (assigneeError) setActionMessage(`Akce je uložená, ale přiřazení selhalo: ${assigneeError.message}`);
    }

    setSaving(false);
    setActionOpen(false);
    setSelectedEmployees([]);
    setSelectedElevatorId("");
    setElevatorQuery("");
    setForm({ title: "", action_type: "servis", date: form.date, start: "08:00", end: "10:00", address: "", description: "" });
    await loadNotifications();
    window.location.reload();
  }

  if (pathname === "/login") return null;

  return (
    <>
      <div className="global-user-tools" ref={rootRef}>
        <div className="global-tool-wrap">
          <button
            className="global-tool-button"
            type="button"
            aria-label="Upozornění"
            onClick={() => { setNotificationOpen((value) => !value); setProfileOpen(false); }}
          >
            <span aria-hidden="true">♢</span>
            {unreadCount > 0 && <b>{Math.min(unreadCount, 99)}</b>}
          </button>
          {notificationOpen && (
            <section className="global-dropdown notification-dropdown">
              <header><div><strong>Upozornění</strong><span>{unreadCount} nepřečtených</span></div><button type="button" onClick={markAllRead}>Označit vše</button></header>
              <div className="global-notification-list">
                {notifications.length === 0 ? <p className="global-empty">Zatím tu nejsou žádná upozornění.</p> : notifications.map((item) => (
                  <button key={item.key} type="button" className={readKeys.includes(item.key) ? "read" : ""} onClick={() => markRead(item)}>
                    <i className={item.tone} />
                    <span><strong>{item.title}</strong><small>{item.detail}</small><em>{new Date(item.createdAt).toLocaleString("cs-CZ")}</em></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="global-tool-wrap">
          <button
            className="global-avatar-button"
            type="button"
            onClick={() => { setProfileOpen((value) => !value); setNotificationOpen(false); }}
          >
            {initials(profile?.full_name || profile?.email || "U")}
            <span />
          </button>
          {profileOpen && (
            <section className="global-dropdown profile-dropdown">
              <div className="profile-dropdown-head"><div className="profile-large-avatar">{initials(profile?.full_name || "U")}</div><div><strong>{profile?.full_name || "Uživatel"}</strong><span>{roleLabels[profile?.role ?? ""] ?? profile?.role ?? ""}</span><small>{profile?.email}</small></div></div>
              <button type="button" className="global-logout" onClick={logout}>Odhlásit se</button>
            </section>
          )}
        </div>
      </div>

      {pathname === "/dashboard" && (
        <button className="global-calendar-add" type="button" onClick={openActionModal}>＋ Přidat akci do kalendáře</button>
      )}

      {actionOpen && (
        <div className="global-modal-backdrop" onMouseDown={() => setActionOpen(false)}>
          <form className="global-action-modal" onSubmit={saveAction} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><strong>Nová akce</strong><span>Přidání přímo z hlavního kalendáře</span></div><button type="button" onClick={() => setActionOpen(false)}>×</button></header>
            {actionMessage && <div className="global-form-message">{actionMessage}</div>}
            <label>Název<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Např. výměna rozvaděče" /></label>
            <div className="global-form-grid three"><label>Typ<select value={form.action_type} onChange={(event) => setForm({ ...form, action_type: event.target.value })}>{actionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Datum<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>Čas<input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label></div>
            <label>Výtah – vyhledej uložený, napiš vlastní nebo nech prázdné<div className="global-combobox"><input value={elevatorQuery} onChange={(event) => { setElevatorQuery(event.target.value); setSelectedElevatorId(""); }} placeholder="Adresa, označení nebo vlastní text…" />{elevatorSuggestions.length > 0 && <div className="global-suggestions">{elevatorSuggestions.map((item) => <button type="button" key={item.id} onClick={() => chooseElevator(item)}><strong>{item.address}</strong><span>{item.label}</span></button>)}</div>}</div></label>
            <div className="global-form-grid two"><label>Od<input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label><label>Do<input required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label></div>
            <label>Adresa<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Může zůstat prázdná" /></label>
            <label>Poznámka<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <fieldset><legend>Přiřadit zaměstnance – volitelné</legend><div className="global-employee-grid">{employees.map((employee) => <label key={employee.id}><input type="checkbox" checked={selectedEmployees.includes(employee.id)} onChange={() => setSelectedEmployees((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} />{employee.full_name}</label>)}</div></fieldset>
            <footer><button type="button" className="secondary" onClick={() => setActionOpen(false)}>Zrušit</button><button disabled={saving} type="submit">{saving ? "Ukládám…" : "Uložit akci"}</button></footer>
          </form>
        </div>
      )}
    </>
  );
}
