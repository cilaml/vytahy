"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccessControl } from "@/components/AccessControl";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; full_name: string; active: boolean };
type Tool = {
  id: string;
  inventory_number: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  status: "sklad" | "vydano" | "oprava" | "vyrazeno";
  current_holder_id: string | null;
  note: string | null;
};
type ActionStatus = "planovano" | "potvrzeno" | "na_ceste" | "rozpracovano" | "hotovo" | "zruseno";
type PlannedAction = { id: string; title: string; status: ActionStatus; starts_at: string; ends_at: string; address: string };
type ActionTool = { id: string; planned_action_id: string; tool_id: string; prepared_at: string | null; prepared_by: string | null; sort_order: number };
type ChecklistTemplate = { id: string; name: string; note: string | null };
type TemplateItem = { template_id: string; tool_id: string; sort_order: number };

const statusLabels: Record<Tool["status"], string> = {
  sklad: "Ve skladu", vydano: "Vydáno", oprava: "V opravě", vyrazeno: "Vyřazeno",
};
const actionStatusLabels: Record<ActionStatus, string> = {
  planovano: "Naplánováno", potvrzeno: "Potvrzeno", na_ceste: "Na cestě",
  rozpracovano: "Rozpracováno", hotovo: "Hotovo", zruseno: "Zrušeno",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyChecklistForm() {
  return {
    existingActionId: "", title: "", date: localDateKey(), start: "08:00", end: "10:00", address: "",
    assigneeIds: [] as string[], templateId: "", saveAsTemplate: false, templateName: "",
  };
}

function actionDate(value: string) {
  return new Date(value).toLocaleDateString("cs-CZ", {
    weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function ToolsPage() {
  const { canManage } = useAccessControl();
  const canManageTools = canManage("tools");
  const canCreateAction = canManageTools && canManage("planned_actions");
  const [tools, setTools] = useState<Tool[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [actions, setActions] = useState<PlannedAction[]>([]);
  const [actionTools, setActionTools] = useState<ActionTool[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Tool | null>(null);
  const [selectedChecklist, setSelectedChecklist] = useState<PlannedAction | null>(null);
  const [holderId, setHolderId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [toolPickerSearch, setToolPickerSearch] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [checklistForm, setChecklistForm] = useState(emptyChecklistForm);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [form, setForm] = useState({ name: "", inventory_number: "", category: "", brand: "", model: "", note: "" });

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    setUserId(user.id);
    const [toolResult, profileResult, actionResult, actionToolResult, templateResult, templateItemResult] = await Promise.all([
      supabase.from("tools").select("id, inventory_number, name, category, brand, model, status, current_holder_id, note").order("name"),
      supabase.from("profiles").select("id, full_name, active").eq("active", true).order("full_name"),
      supabase.from("planned_actions").select("id,title,status,starts_at,ends_at,address").neq("status", "zruseno").order("starts_at", { ascending: false }).limit(180),
      supabase.from("planned_action_tools").select("id,planned_action_id,tool_id,prepared_at,prepared_by,sort_order").order("sort_order"),
      supabase.from("tool_checklist_templates").select("id,name,note").order("name"),
      supabase.from("tool_checklist_template_items").select("template_id,tool_id,sort_order").order("sort_order"),
    ]);
    const error = toolResult.error || profileResult.error || actionResult.error || actionToolResult.error || templateResult.error || templateItemResult.error;
    if (error) setMessage(`Evidence nářadí zatím není připravená v databázi: ${error.message}`);
    setTools((toolResult.data ?? []) as Tool[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setActions((actionResult.data ?? []) as PlannedAction[]);
    setActionTools((actionToolResult.data ?? []) as ActionTool[]);
    setTemplates((templateResult.data ?? []) as ChecklistTemplate[]);
    setTemplateItems((templateItemResult.data ?? []) as TemplateItem[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("cs-CZ");
    if (!value) return tools;
    return tools.filter((tool) => [tool.name, tool.inventory_number, tool.brand, tool.model, tool.category]
      .filter(Boolean).join(" ").toLocaleLowerCase("cs-CZ").includes(value));
  }, [tools, search]);

  const pickerTools = useMemo(() => {
    const value = toolPickerSearch.trim().toLocaleLowerCase("cs-CZ");
    return tools.filter((tool) => tool.status !== "vyrazeno")
      .filter((tool) => !value || [tool.name, tool.inventory_number, tool.brand, tool.model, tool.category]
        .filter(Boolean).join(" ").toLocaleLowerCase("cs-CZ").includes(value))
      .sort((a, b) => Number(selectedToolIds.includes(b.id)) - Number(selectedToolIds.includes(a.id)) || a.name.localeCompare(b.name, "cs"));
  }, [tools, toolPickerSearch, selectedToolIds]);

  const counts = useMemo(() => ({
    sklad: tools.filter((item) => item.status === "sklad").length,
    vydano: tools.filter((item) => item.status === "vydano").length,
    oprava: tools.filter((item) => item.status === "oprava").length,
  }), [tools]);

  const checklistActions = useMemo(() => {
    const now = Date.now();
    return actions.filter((action) => actionTools.some((item) => item.planned_action_id === action.id)).sort((a, b) => {
      const aDone = a.status === "hotovo";
      const bDone = b.status === "hotovo";
      if (aDone !== bDone) return Number(aDone) - Number(bDone);
      const aFuture = new Date(a.ends_at).getTime() >= now;
      const bFuture = new Date(b.ends_at).getTime() >= now;
      if (aFuture !== bFuture) return Number(bFuture) - Number(aFuture);
      return Math.abs(new Date(a.starts_at).getTime() - now) - Math.abs(new Date(b.starts_at).getTime() - now);
    });
  }, [actions, actionTools]);

  const availableActions = useMemo(() => actions
    .filter((action) => action.status !== "hotovo" && action.status !== "zruseno")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [actions]);

  function holderName(id: string | null) {
    if (!id) return "Sklad";
    return profiles.find((profile) => profile.id === id)?.full_name ?? "Neznámý zaměstnanec";
  }
  function linksForAction(actionId: string) {
    return actionTools.filter((item) => item.planned_action_id === actionId).sort((a, b) => a.sort_order - b.sort_order);
  }
  function toolById(toolId: string) { return tools.find((tool) => tool.id === toolId); }

  function openNewChecklist() {
    const next = emptyChecklistForm();
    if (!canCreateAction && availableActions.length > 0) next.existingActionId = availableActions[0].id;
    setChecklistForm(next);
    setSelectedToolIds(next.existingActionId ? linksForAction(next.existingActionId).map((item) => item.tool_id) : []);
    setToolPickerSearch("");
    setShowChecklistForm(true);
  }
  function selectExistingAction(actionId: string) {
    setChecklistForm((current) => ({ ...current, existingActionId: actionId }));
    setSelectedToolIds(actionId ? linksForAction(actionId).map((item) => item.tool_id) : []);
  }
  function applyTemplate(templateId: string) {
    setChecklistForm((current) => ({ ...current, templateId }));
    if (!templateId) return;
    setSelectedToolIds(templateItems.filter((item) => item.template_id === templateId)
      .sort((a, b) => a.sort_order - b.sort_order).map((item) => item.tool_id));
  }
  function toggleTool(toolId: string) {
    setSelectedToolIds((current) => current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId]);
  }
  function toggleAssignee(profileId: string) {
    setChecklistForm((current) => ({ ...current, assigneeIds: current.assigneeIds.includes(profileId)
      ? current.assigneeIds.filter((id) => id !== profileId) : [...current.assigneeIds, profileId] }));
  }

  async function saveChecklist(event: FormEvent) {
    event.preventDefault();
    if (selectedToolIds.length === 0) { setMessage("Vyber alespoň jednu položku nářadí."); return; }
    if (!checklistForm.existingActionId && !canCreateAction) {
      setMessage("Můžeš doplnit checklist k existující akci, ale nemáš oprávnění vytvářet novou."); return;
    }
    if (checklistForm.saveAsTemplate && !checklistForm.templateName.trim()) { setMessage("Doplň název nové šablony."); return; }
    setSaving(true); setMessage(""); setSuccess("");
    const startsAt = checklistForm.existingActionId ? null : new Date(`${checklistForm.date}T${checklistForm.start}`).toISOString();
    const endsAt = checklistForm.existingActionId ? null : new Date(`${checklistForm.date}T${checklistForm.end}`).toISOString();
    const supabase = createClient();
    const { error } = await supabase.rpc("save_tool_checklist_action", {
      target_action_id: checklistForm.existingActionId || null,
      action_title: checklistForm.title || null,
      action_starts_at: startsAt,
      action_ends_at: endsAt,
      action_address: checklistForm.address || null,
      assignee_ids: checklistForm.assigneeIds,
      selected_tool_ids: selectedToolIds,
      saved_template_name: checklistForm.saveAsTemplate ? checklistForm.templateName.trim() : null,
    });
    if (error) setMessage(`Checklist se nepovedlo uložit: ${error.message}`);
    else {
      setSuccess(checklistForm.existingActionId ? "Checklist akce je aktualizovaný." : "Akce i checklist jsou vytvořené.");
      setShowChecklistForm(false); await load();
    }
    setSaving(false);
  }

  async function togglePrepared(link: ActionTool) {
    if (!canManageTools) return;
    const preparedAt = link.prepared_at ? null : new Date().toISOString();
    const supabase = createClient();
    const { error } = await supabase.from("planned_action_tools")
      .update({ prepared_at: preparedAt, prepared_by: preparedAt ? userId : null }).eq("id", link.id);
    if (error) { setMessage(`Položku se nepovedlo změnit: ${error.message}`); return; }
    setActionTools((current) => current.map((item) => item.id === link.id
      ? { ...item, prepared_at: preparedAt, prepared_by: preparedAt ? userId : null } : item));
  }

  async function saveCurrentAsTemplate(event: FormEvent) {
    event.preventDefault();
    if (!selectedChecklist || !templateDraftName.trim()) return;
    setSaving(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("save_tool_checklist_template", {
      saved_template_name: templateDraftName.trim(),
      selected_tool_ids: linksForAction(selectedChecklist.id).map((item) => item.tool_id),
    });
    if (error) setMessage(`Šablonu se nepovedlo uložit: ${error.message}`);
    else { setSuccess("Šablona checklistu je uložená pro příště."); setShowTemplateSave(false); setTemplateDraftName(""); await load(); }
    setSaving(false);
  }

  async function deleteTemplate(template: ChecklistTemplate) {
    if (!window.confirm(`Smazat šablonu „${template.name}“?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("tool_checklist_templates").delete().eq("id", template.id);
    if (error) setMessage(`Šablonu se nepovedlo smazat: ${error.message}`); else await load();
  }

  async function createTool(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const supabase = createClient();
    const number = form.inventory_number.trim() || `N-${String(tools.length + 1).padStart(4, "0")}`;
    const { error } = await supabase.from("tools").insert({
      inventory_number: number, name: form.name.trim(), category: form.category || null,
      brand: form.brand || null, model: form.model || null, note: form.note || null, created_by: userId,
    });
    if (error) setMessage(`Nářadí se nepovedlo uložit: ${error.message}`);
    else { setForm({ name: "", inventory_number: "", category: "", brand: "", model: "", note: "" }); setShowNew(false); setSuccess("Nářadí je uložené."); await load(); }
    setSaving(false);
  }

  async function moveTool(tool: Tool, action: "vydani" | "vraceni" | "oprava") {
    if (action === "vydani" && !holderId) { setMessage("Nejdřív vyber zaměstnance."); return; }
    setSaving(true); setMessage("");
    const supabase = createClient();
    const nextHolder = action === "vydani" ? holderId : null;
    const nextStatus = action === "vydani" ? "vydano" : action === "oprava" ? "oprava" : "sklad";
    const { error } = await supabase.from("tools").update({ current_holder_id: nextHolder, status: nextStatus, updated_at: new Date().toISOString() }).eq("id", tool.id);
    if (!error) {
      const { error: movementError } = await supabase.from("tool_movements").insert({
        tool_id: tool.id, movement_type: action, from_profile_id: tool.current_holder_id, to_profile_id: nextHolder, performed_by: userId,
      });
      if (movementError) setMessage(`Stav se změnil, ale historie se neuložila: ${movementError.message}`);
    } else setMessage(`Změna se nepovedla: ${error.message}`);
    setSelected(null); setHolderId(""); await load(); setSaving(false);
  }

  function qrUrl(tool: Tool) {
    const target = typeof window === "undefined" ? tool.inventory_number : `${window.location.origin}/tools?tool=${tool.id}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=700x700&ecc=H&margin=24&data=${encodeURIComponent(target)}`;
  }

  const selectedChecklistLinks = selectedChecklist ? linksForAction(selectedChecklist.id) : [];
  const selectedPreparedCount = selectedChecklistLinks.filter((item) => item.prepared_at).length;

  return <main className="tools-shell">
    <header className="tools-head"><div><p className="eyebrow">NÁŘADÍ A VYBAVENÍ</p><h1>Evidence nářadí</h1><p>Výdej nářadí i příprava kompletní výbavy na konkrétní práci.</p></div>{canManageTools && <div className="head-actions"><button className="secondary" onClick={openNewChecklist}>☑ Připravit na akci</button><button className="primary" onClick={() => setShowNew(true)}>＋ Přidat nářadí</button></div>}</header>
    {message && <div className="notice error">{message}</div>}{success && <div className="notice success-notice">{success}</div>}
    <section className="stats"><article><strong>{counts.sklad}</strong><span>ve skladu</span></article><article><strong>{counts.vydano}</strong><span>u zaměstnanců</span></article><article><strong>{counts.oprava}</strong><span>v opravě</span></article><article><strong>{tools.length}</strong><span>celkem</span></article></section>

    <section className="checklists-card">
      <div className="section-title"><div><p className="eyebrow">CHECKLISTY NA AKCE</p><h2>Co je potřeba vzít s sebou</h2></div>{canManageTools && <button className="secondary compact" onClick={openNewChecklist}>＋ Nový checklist</button>}</div>
      {templates.length > 0 && <div className="template-row"><span>Uložené šablony:</span>{templates.map((template) => <span className="template-chip" key={template.id}>{template.name}<small>{templateItems.filter((item) => item.template_id === template.id).length} ks</small>{canManageTools && <button title="Smazat šablonu" onClick={() => void deleteTemplate(template)}>×</button>}</span>)}</div>}
      {loading ? <div className="empty compact-empty">Načítám checklisty…</div> : checklistActions.length === 0 ? <div className="empty compact-empty">Zatím tu není žádný checklist. Vytvoř ho pro první akci nebo použij uloženou šablonu.</div> : <div className="checklist-grid">{checklistActions.slice(0, 8).map((action) => {
        const links = linksForAction(action.id); const prepared = links.filter((item) => item.prepared_at).length; const complete = links.length > 0 && prepared === links.length;
        return <button className={`checklist-card ${complete ? "complete" : ""}`} key={action.id} onClick={() => { setSelectedChecklist(action); setShowTemplateSave(false); }}><span className="checklist-top"><span className={`action-status ${action.status}`}>{actionStatusLabels[action.status]}</span><strong>{prepared}/{links.length}</strong></span><span className="checklist-title">{action.title}</span><small>{actionDate(action.starts_at)}{action.address ? ` · ${action.address}` : ""}</small><span className="progress"><i style={{ width: `${links.length ? (prepared / links.length) * 100 : 0}%` }} /></span><span className="checklist-foot">{complete ? "✓ Všechno připraveno" : `Zbývá připravit ${links.length - prepared} položek`}</span></button>;
      })}</div>}
    </section>

    <section className="tools-card"><div className="tools-toolbar"><div className="search"><span>⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hledej název, značku nebo inventární číslo…" /></div><span>{filtered.length} položek</span></div>{loading ? <div className="empty">Načítám nářadí…</div> : filtered.length === 0 ? <div className="empty">Nic nenalezeno. Přidej první nářadí nebo změň hledání.</div> : <div className="tool-grid">{filtered.map((tool) => <article className="tool-item" key={tool.id}><button className="tool-main" onClick={() => { setSelected(tool); setHolderId(tool.current_holder_id ?? ""); }}><span className={`tool-status ${tool.status}`} /><span className="tool-copy"><strong>{tool.name}</strong><small>{[tool.brand, tool.model].filter(Boolean).join(" ") || tool.category || "Bez doplňujících údajů"}</small></span><span className="tool-location"><strong>{statusLabels[tool.status]}</strong><small>{holderName(tool.current_holder_id)}</small></span><span className="tool-number">{tool.inventory_number}</span><span className="arrow">›</span></button></article>)}</div>}</section>

    {showChecklistForm && <div className="modal-backdrop" onClick={() => setShowChecklistForm(false)}><form className="modal checklist-editor" onSubmit={saveChecklist} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>Příprava nářadí na akci</h2><p>Vyber akci, sestav seznam a případně si ho ulož jako šablonu.</p></div><button type="button" className="close" onClick={() => setShowChecklistForm(false)}>×</button></div><div className="editor-columns"><div className="editor-settings">
      <label>Akce<select value={checklistForm.existingActionId} onChange={(event) => selectExistingAction(event.target.value)}>{canCreateAction && <option value="">＋ Vytvořit novou akci</option>}{availableActions.map((action) => <option key={action.id} value={action.id}>{actionDate(action.starts_at)} — {action.title}</option>)}</select></label>
      {!checklistForm.existingActionId && <><label>Název akce<input required value={checklistForm.title} onChange={(event) => setChecklistForm({ ...checklistForm, title: event.target.value })} placeholder="Např. Servis výtahu Jiráskova" /></label><div className="three"><label>Datum<input required type="date" value={checklistForm.date} onChange={(event) => setChecklistForm({ ...checklistForm, date: event.target.value })} /></label><label>Od<input required type="time" value={checklistForm.start} onChange={(event) => setChecklistForm({ ...checklistForm, start: event.target.value })} /></label><label>Do<input required type="time" value={checklistForm.end} onChange={(event) => setChecklistForm({ ...checklistForm, end: event.target.value })} /></label></div><label>Adresa<input value={checklistForm.address} onChange={(event) => setChecklistForm({ ...checklistForm, address: event.target.value })} placeholder="Místo práce" /></label><fieldset><legend>Přiřadit zaměstnance</legend><div className="people-picks">{profiles.map((profile) => <label className="person-check" key={profile.id}><input type="checkbox" checked={checklistForm.assigneeIds.includes(profile.id)} onChange={() => toggleAssignee(profile.id)} /><span>{profile.full_name}</span></label>)}</div></fieldset></>}
      <label>Použít šablonu<select value={checklistForm.templateId} onChange={(event) => applyTemplate(event.target.value)}><option value="">Bez šablony</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({templateItems.filter((item) => item.template_id === template.id).length} položek)</option>)}</select></label>
      <label className="save-template"><input type="checkbox" checked={checklistForm.saveAsTemplate} onChange={(event) => setChecklistForm({ ...checklistForm, saveAsTemplate: event.target.checked })} /><span>Tento výběr uložit jako šablonu</span></label>{checklistForm.saveAsTemplate && <label>Název šablony<input required value={checklistForm.templateName} onChange={(event) => setChecklistForm({ ...checklistForm, templateName: event.target.value })} placeholder="Např. Běžný servis" /></label>}
      </div><div className="tool-picker"><div className="picker-head"><div><strong>Checklist nářadí</strong><small>{selectedToolIds.length} vybráno</small></div><input value={toolPickerSearch} onChange={(event) => setToolPickerSearch(event.target.value)} placeholder="Hledat nářadí…" /></div><div className="picker-list">{pickerTools.map((tool) => <label className={`picker-item ${selectedToolIds.includes(tool.id) ? "picked" : ""}`} key={tool.id}><input type="checkbox" checked={selectedToolIds.includes(tool.id)} onChange={() => toggleTool(tool.id)} /><span><strong>{tool.name}</strong><small>{tool.inventory_number} · {statusLabels[tool.status]}{tool.current_holder_id ? ` u ${holderName(tool.current_holder_id)}` : ""}</small></span></label>)}</div></div></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowChecklistForm(false)}>Zrušit</button><button className="primary" disabled={saving}>{saving ? "Ukládám…" : checklistForm.existingActionId ? "Uložit checklist" : "Vytvořit akci a checklist"}</button></div></form></div>}

    {selectedChecklist && <div className="modal-backdrop" onClick={() => setSelectedChecklist(null)}><section className="modal checklist-detail" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className={`action-status ${selectedChecklist.status}`}>{actionStatusLabels[selectedChecklist.status]}</span><h2>{selectedChecklist.title}</h2><p>{actionDate(selectedChecklist.starts_at)}{selectedChecklist.address ? ` · ${selectedChecklist.address}` : ""}</p></div><button type="button" className="close" onClick={() => setSelectedChecklist(null)}>×</button></div><div className="detail-progress"><div><strong>{selectedPreparedCount} z {selectedChecklistLinks.length} připraveno</strong><span>{selectedPreparedCount === selectedChecklistLinks.length ? "Může se vyrazit" : `Zbývá ${selectedChecklistLinks.length - selectedPreparedCount}`}</span></div><span className="progress large"><i style={{ width: `${selectedChecklistLinks.length ? (selectedPreparedCount / selectedChecklistLinks.length) * 100 : 0}%` }} /></span></div><div className="check-items">{selectedChecklistLinks.map((link) => { const tool = toolById(link.tool_id); if (!tool) return null; return <button disabled={!canManageTools} className={`check-item ${link.prepared_at ? "checked" : ""}`} key={link.id} onClick={() => void togglePrepared(link)}><span className="check-box">{link.prepared_at ? "✓" : ""}</span><span><strong>{tool.name}</strong><small>{tool.inventory_number} · {statusLabels[tool.status]}{tool.current_holder_id ? ` u ${holderName(tool.current_holder_id)}` : ""}</small></span><em>{link.prepared_at ? "Připraveno" : "Odškrtnout"}</em></button>; })}</div>{canManageTools && <div className="template-save-area">{showTemplateSave ? <form onSubmit={saveCurrentAsTemplate}><input autoFocus required value={templateDraftName} onChange={(event) => setTemplateDraftName(event.target.value)} placeholder="Název nové šablony" /><button className="primary" disabled={saving}>Uložit šablonu</button><button type="button" className="secondary" onClick={() => setShowTemplateSave(false)}>Zrušit</button></form> : <button className="secondary" onClick={() => setShowTemplateSave(true)}>☆ Uložit tento seznam jako šablonu</button>}</div>}</section></div>}

    {showNew && <div className="modal-backdrop" onClick={() => setShowNew(false)}><form className="modal" onSubmit={createTool} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>Nové nářadí</h2><p>Vyplň hlavně název. Zbytek lze doplnit později.</p></div><button type="button" className="close" onClick={() => setShowNew(false)}>×</button></div><label>Název<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Např. Hilti TE 30" /></label><div className="two"><label>Inventární číslo<input value={form.inventory_number} onChange={(event) => setForm({ ...form, inventory_number: event.target.value })} placeholder="Vytvoří se automaticky" /></label><label>Kategorie<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Vrtačka, měřidlo…" /></label></div><div className="two"><label>Značka<input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label><label>Model<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label></div><label>Poznámka<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><button className="primary" disabled={saving}>{saving ? "Ukládám…" : "Uložit a vytvořit QR"}</button></form></div>}

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="modal tool-detail" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="detail-number">{selected.inventory_number}</span><h2>{selected.name}</h2><p>{holderName(selected.current_holder_id)} · {statusLabels[selected.status]}</p></div><button type="button" className="close" onClick={() => setSelected(null)}>×</button></div><div className="detail-grid"><div className="qr-label"><div className="qr-wrap"><img className="qr" src={qrUrl(selected)} alt={`QR kód ${selected.inventory_number}`} /><span className="qr-logo"><img src="/vytahy-dc-mark.svg" alt="" /></span></div><strong>{selected.name}</strong><span>{selected.inventory_number}</span><button onClick={() => window.print()}>Vytisknout štítek</button></div><div className="quick-actions"><h3>Rychlá akce</h3>{canManageTools ? <>{selected.status !== "sklad" && <button className="success" disabled={saving} onClick={() => moveTool(selected, "vraceni")}>✓ Vrátit do skladu</button>}<label>Vydat zaměstnanci<select value={holderId} onChange={(event) => setHolderId(event.target.value)}><option value="">Vyber zaměstnance</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label><button className="primary" disabled={saving} onClick={() => moveTool(selected, "vydani")}>→ Vydat / předat</button><button className="warning" disabled={saving} onClick={() => moveTool(selected, "oprava")}>⚠ Označit v opravě</button></> : <p className="readonly-note">Máš přístup jen pro prohlížení.</p>}</div></div></section></div>}

    <style jsx>{`
      .tools-shell{min-height:100vh;padding:30px 34px 60px;background:#f3f6f8;color:#102536}.tools-head,.checklists-card,.tools-card,.stats,.notice{max-width:1450px;margin-left:auto;margin-right:auto}.tools-head{margin-bottom:22px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.eyebrow{font-size:11px;font-weight:950;letter-spacing:.12em;color:#079447;margin:0}.tools-head h1{font-size:36px;margin:5px 0}.tools-head p{color:#657886;margin:0}.head-actions,.modal-actions{display:flex;gap:10px;align-items:center}.primary,.secondary,.success,.warning{border:0;border-radius:11px;padding:12px 16px;font-weight:900;cursor:pointer}.primary{background:#079447;color:white}.secondary{background:white;color:#17384e;border:1px solid #cbd8de}.secondary.compact{padding:9px 12px}.success{background:#e6f7ec;color:#08783c}.warning{background:#fff1dd;color:#9a4d00}.primary:disabled,.secondary:disabled,.success:disabled,.warning:disabled{opacity:.55;cursor:wait}.notice{margin-bottom:16px;padding:12px 14px;border-radius:12px}.notice.error{border:1px solid #e4bd62;background:#fff7df}.success-notice{border:1px solid #a8dbb9;background:#edfbf2;color:#08783c}.stats{margin-bottom:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.stats article{background:white;border:1px solid #dce5ea;border-radius:15px;padding:18px;display:grid;gap:4px;box-shadow:0 8px 24px rgba(16,37,54,.05)}.stats strong{font-size:29px;color:#082a49}.stats span{color:#657886;font-weight:700}.checklists-card,.tools-card{background:white;border:1px solid #dce5ea;border-radius:18px;box-shadow:0 12px 35px rgba(16,37,54,.07)}.checklists-card{padding:20px;margin-bottom:18px}.section-title{display:flex;justify-content:space-between;align-items:center;gap:15px}.section-title h2{margin:4px 0 0;font-size:23px}.template-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:15px 0;color:#687b89;font-size:13px;font-weight:800}.template-chip{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:99px;background:#eef5f1;color:#174e34}.template-chip small{color:#668173}.template-chip button{border:0;background:transparent;color:#587264;font-size:17px;cursor:pointer}.checklist-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:17px}.checklist-card{display:grid;gap:9px;text-align:left;border:1px solid #dce5ea;background:#fbfcfd;border-radius:14px;padding:14px;cursor:pointer;color:#102536}.checklist-card:hover{border-color:#9bcbb0;transform:translateY(-1px)}.checklist-card.complete{background:#f1fbf5;border-color:#aedcc0}.checklist-top{display:flex;justify-content:space-between;align-items:center}.action-status{display:inline-flex;width:max-content;border-radius:99px;padding:4px 8px;background:#e7eef5;color:#38566d;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.action-status.rozpracovano,.action-status.na_ceste{background:#fff0d9;color:#9a5100}.action-status.hotovo{background:#dcf5e6;color:#08783c}.checklist-title{font-weight:950;font-size:16px}.checklist-card small{color:#6c7e8b;min-height:34px}.progress{height:7px;border-radius:99px;background:#dfe7eb;overflow:hidden}.progress i{display:block;height:100%;background:#079447;border-radius:inherit;transition:width .2s}.checklist-foot{font-size:12px;font-weight:900;color:#476274}.checklist-card.complete .checklist-foot{color:#08783c}.tools-card{overflow:hidden}.tools-toolbar{padding:16px;display:flex;align-items:center;gap:15px;border-bottom:1px solid #e3eaee;color:#687b89}.search{flex:1;display:flex;align-items:center;border:1px solid #cdd9df;border-radius:12px;padding:0 12px}.search input{width:100%;border:0;padding:13px;background:transparent;outline:0}.tool-grid{display:grid}.tool-item{border-bottom:1px solid #edf1f3}.tool-main{width:100%;display:grid;grid-template-columns:12px minmax(220px,1fr) minmax(150px,.5fr) 110px 20px;gap:14px;align-items:center;text-align:left;padding:15px 18px;border:0;background:white;cursor:pointer}.tool-main:hover{background:#f7faf8}.tool-status{width:10px;height:10px;border-radius:99px;background:#8b9aa5}.tool-status.sklad{background:#079447}.tool-status.vydano{background:#2572d3}.tool-status.oprava{background:#e88318}.tool-copy,.tool-location{display:grid;gap:3px}.tool-copy small,.tool-location small{color:#71828e}.tool-location strong{font-size:13px}.tool-number{font-family:monospace;font-weight:900;color:#36566d}.arrow{font-size:26px;color:#7d909d}.empty{text-align:center;padding:50px;color:#71828e}.compact-empty{padding:30px 10px 12px}.modal-backdrop{position:fixed;z-index:2000;inset:0;background:rgba(3,17,29,.58);display:grid;place-items:center;padding:20px}.modal{width:min(680px,100%);max-height:92vh;overflow:auto;background:white;border-radius:18px;padding:22px;box-shadow:0 25px 80px rgba(0,0,0,.3)}.modal-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:18px}.modal-head h2{margin:7px 0 5px}.modal-head p{margin:0;color:#687b89}.close{border:0;background:#eef2f4;width:38px;height:38px;border-radius:10px;font-size:24px;cursor:pointer;flex:0 0 auto}.modal label{display:grid;gap:6px;font-weight:800;margin-bottom:13px}.modal input,.modal select,.modal textarea{width:100%;border:1px solid #cbd8de;border-radius:10px;padding:11px;background:white}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.three{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:8px}.checklist-editor{width:min(1120px,100%)}.editor-columns{display:grid;grid-template-columns:minmax(310px,.8fr) minmax(400px,1.2fr);gap:22px}.editor-settings{padding-right:20px;border-right:1px solid #e3eaee}.editor-settings fieldset{border:1px solid #d5e0e5;border-radius:11px;margin:0 0 13px;padding:10px}.editor-settings legend{font-size:13px;font-weight:900;padding:0 5px}.people-picks{max-height:130px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:4px}.modal .person-check,.modal .save-template{display:flex;align-items:center;gap:7px;margin:0;padding:6px;font-size:13px}.modal .person-check input,.modal .save-template input,.picker-item input{width:17px;height:17px;margin:0;accent-color:#079447}.save-template{border-radius:10px;background:#f1f7f4;margin-bottom:12px!important}.tool-picker{min-width:0}.picker-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.picker-head>div{display:grid;gap:2px}.picker-head small{color:#6a7d89}.picker-head input{max-width:260px}.picker-list{max-height:490px;overflow:auto;border:1px solid #dce5ea;border-radius:12px}.modal .picker-item{display:grid;grid-template-columns:20px 1fr;align-items:center;gap:10px;margin:0;padding:11px;border-bottom:1px solid #edf1f3;cursor:pointer}.picker-item.picked{background:#eff9f3}.picker-item>span{display:grid;gap:2px}.picker-item small{color:#6c7e89;font-weight:600}.modal-actions{justify-content:flex-end;margin-top:18px;padding-top:15px;border-top:1px solid #e3eaee}.checklist-detail{width:min(760px,100%)}.detail-progress{border:1px solid #d8e4de;background:#f4fbf7;border-radius:13px;padding:14px;margin-bottom:14px;display:grid;gap:10px}.detail-progress>div{display:flex;justify-content:space-between}.detail-progress span{color:#4f6d5d}.progress.large{height:10px}.check-items{border:1px solid #dce5ea;border-radius:13px;overflow:hidden}.check-item{width:100%;display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:11px;padding:13px;border:0;border-bottom:1px solid #e8edef;background:white;text-align:left;color:#173346;cursor:pointer}.check-item:last-child{border-bottom:0}.check-item.checked{background:#f0faf4}.check-item:disabled{cursor:default}.check-box{width:26px;height:26px;display:grid;place-items:center;border:2px solid #aabac3;border-radius:7px;color:white;font-weight:950}.checked .check-box{background:#079447;border-color:#079447}.check-item>span:nth-child(2){display:grid;gap:3px}.check-item small{color:#6a7c88}.check-item em{font-size:12px;font-style:normal;font-weight:900;color:#69808d}.checked em{color:#08783c}.template-save-area{margin-top:15px}.template-save-area form{display:grid;grid-template-columns:1fr auto auto;gap:8px}.tool-detail{width:min(850px,100%)}.detail-number{font-family:monospace;color:#079447;font-weight:900}.detail-grid{display:grid;grid-template-columns:300px 1fr;gap:24px}.qr-label{border:1px solid #dce5ea;border-radius:15px;padding:16px;text-align:center;display:grid;gap:7px}.qr-wrap{position:relative;aspect-ratio:1;background:white}.qr{width:100%;height:100%}.qr-logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:28%;height:25%;display:grid;place-items:center;background:white;border-radius:10px;padding:4px}.qr-logo img{width:100%;height:100%;object-fit:contain}.qr-label button{border:1px solid #cbd8de;border-radius:9px;background:white;padding:9px;font-weight:800;cursor:pointer}.quick-actions{display:grid;gap:12px;align-content:start}.quick-actions h3{margin:0 0 4px}.quick-actions label{margin:0}.readonly-note{padding:12px;background:#f2f5f6;border-radius:10px;color:#647784}
      @media(max-width:1100px){.checklist-grid{grid-template-columns:1fr 1fr}.editor-columns{grid-template-columns:1fr}.editor-settings{padding-right:0;border-right:0;border-bottom:1px solid #e3eaee;padding-bottom:10px}.picker-list{max-height:350px}}
      @media(max-width:900px){.tools-shell{padding:15px}.tools-head{align-items:stretch;flex-direction:column}.head-actions{display:grid;grid-template-columns:1fr 1fr}.stats{grid-template-columns:1fr 1fr}.tool-main{grid-template-columns:12px 1fr 20px}.tool-location,.tool-number{display:none}.detail-grid{grid-template-columns:1fr}.two,.three{grid-template-columns:1fr}.editor-columns{display:block}.checklist-grid{grid-template-columns:1fr}.people-picks{grid-template-columns:1fr}.picker-head{align-items:stretch;flex-direction:column}.picker-head input{max-width:none}.template-save-area form{grid-template-columns:1fr}.modal-actions{display:grid;grid-template-columns:1fr 1fr}}
      @media print{body *{visibility:hidden}.qr-label,.qr-label *{visibility:visible}.qr-label{position:fixed;left:0;top:0;width:50mm;height:70mm;border:0}.qr-label button{display:none}}
    `}</style>
  </main>;
}
