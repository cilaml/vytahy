"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

const statusLabels: Record<Tool["status"], string> = {
  sklad: "Ve skladu",
  vydano: "Vydáno",
  oprava: "V opravě",
  vyrazeno: "Vyřazeno",
};

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Tool | null>(null);
  const [holderId, setHolderId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", inventory_number: "", category: "", brand: "", model: "", note: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    setUserId(user.id);
    const [toolResult, profileResult] = await Promise.all([
      supabase.from("tools").select("id, inventory_number, name, category, brand, model, status, current_holder_id, note").order("name"),
      supabase.from("profiles").select("id, full_name, active").eq("active", true).order("full_name"),
    ]);
    const error = toolResult.error || profileResult.error;
    if (error) setMessage(`Evidence nářadí zatím není připravená v databázi: ${error.message}`);
    setTools(toolResult.data ?? []);
    setProfiles(profileResult.data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("cs-CZ");
    if (!value) return tools;
    return tools.filter((tool) => [tool.name, tool.inventory_number, tool.brand, tool.model, tool.category].filter(Boolean).join(" ").toLocaleLowerCase("cs-CZ").includes(value));
  }, [tools, search]);

  const counts = useMemo(() => ({
    sklad: tools.filter((item) => item.status === "sklad").length,
    vydano: tools.filter((item) => item.status === "vydano").length,
    oprava: tools.filter((item) => item.status === "oprava").length,
  }), [tools]);

  function holderName(id: string | null) {
    if (!id) return "Sklad";
    return profiles.find((profile) => profile.id === id)?.full_name ?? "Neznámý zaměstnanec";
  }

  async function createTool(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const supabase = createClient();
    const number = form.inventory_number.trim() || `N-${String(tools.length + 1).padStart(4, "0")}`;
    const { error } = await supabase.from("tools").insert({
      inventory_number: number, name: form.name.trim(), category: form.category || null,
      brand: form.brand || null, model: form.model || null, note: form.note || null, created_by: userId,
    });
    if (error) setMessage(`Nářadí se nepovedlo uložit: ${error.message}`);
    else { setForm({ name: "", inventory_number: "", category: "", brand: "", model: "", note: "" }); setShowNew(false); await load(); }
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
        tool_id: tool.id, movement_type: action, from_profile_id: tool.current_holder_id,
        to_profile_id: nextHolder, performed_by: userId,
      });
      if (movementError) setMessage(`Stav se změnil, ale historie se neuložila: ${movementError.message}`);
    } else setMessage(`Změna se nepovedla: ${error.message}`);
    setSelected(null); setHolderId(""); await load(); setSaving(false);
  }

  function qrUrl(tool: Tool) {
    const target = typeof window === "undefined" ? tool.inventory_number : `${window.location.origin}/tools?tool=${tool.id}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=700x700&ecc=H&margin=24&data=${encodeURIComponent(target)}`;
  }

  return <main className="tools-shell">
    <header className="tools-head"><div><p className="eyebrow">NÁŘADÍ A VYBAVENÍ</p><h1>Evidence nářadí</h1><p>Rychlý výdej, vrácení a dohledání během několika vteřin.</p></div><button className="primary" onClick={() => setShowNew(true)}>＋ Přidat nářadí</button></header>
    {message && <div className="notice">{message}</div>}
    <section className="stats"><article><strong>{counts.sklad}</strong><span>ve skladu</span></article><article><strong>{counts.vydano}</strong><span>u zaměstnanců</span></article><article><strong>{counts.oprava}</strong><span>v opravě</span></article><article><strong>{tools.length}</strong><span>celkem</span></article></section>
    <section className="tools-card">
      <div className="tools-toolbar"><div className="search"><span>⌕</span><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledej název, značku nebo inventární číslo…" /></div><span>{filtered.length} položek</span></div>
      {loading ? <div className="empty">Načítám nářadí…</div> : filtered.length === 0 ? <div className="empty">Nic nenalezeno. Přidej první nářadí nebo změň hledání.</div> : <div className="tool-grid">{filtered.map((tool) => <article className="tool-item" key={tool.id}>
        <button className="tool-main" onClick={() => { setSelected(tool); setHolderId(tool.current_holder_id ?? ""); }}>
          <span className={`tool-status ${tool.status}`} />
          <span className="tool-copy"><strong>{tool.name}</strong><small>{[tool.brand, tool.model].filter(Boolean).join(" ") || tool.category || "Bez doplňujících údajů"}</small></span>
          <span className="tool-location"><strong>{statusLabels[tool.status]}</strong><small>{holderName(tool.current_holder_id)}</small></span>
          <span className="tool-number">{tool.inventory_number}</span><span className="arrow">›</span>
        </button>
      </article>)}</div>}
    </section>

    {showNew && <div className="modal-backdrop" onClick={() => setShowNew(false)}><form className="modal" onSubmit={createTool} onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><h2>Nové nářadí</h2><p>Vyplň hlavně název. Zbytek lze doplnit později.</p></div><button type="button" className="close" onClick={() => setShowNew(false)}>×</button></div><label>Název<input required value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} placeholder="Např. Hilti TE 30" /></label><div className="two"><label>Inventární číslo<input value={form.inventory_number} onChange={(e) => setForm({...form, inventory_number:e.target.value})} placeholder="Vytvoří se automaticky" /></label><label>Kategorie<input value={form.category} onChange={(e) => setForm({...form, category:e.target.value})} placeholder="Vrtačka, měřidlo…" /></label></div><div className="two"><label>Značka<input value={form.brand} onChange={(e) => setForm({...form, brand:e.target.value})} /></label><label>Model<input value={form.model} onChange={(e) => setForm({...form, model:e.target.value})} /></label></div><label>Poznámka<textarea rows={3} value={form.note} onChange={(e) => setForm({...form, note:e.target.value})} /></label><button className="primary" disabled={saving}>{saving ? "Ukládám…" : "Uložit a vytvořit QR"}</button></form></div>}

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="modal tool-detail" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="detail-number">{selected.inventory_number}</span><h2>{selected.name}</h2><p>{holderName(selected.current_holder_id)} · {statusLabels[selected.status]}</p></div><button type="button" className="close" onClick={() => setSelected(null)}>×</button></div><div className="detail-grid"><div className="qr-label"><div className="qr-wrap"><img className="qr" src={qrUrl(selected)} alt={`QR kód ${selected.inventory_number}`} /><span className="qr-logo"><img src="/vytahy-dc-mark.svg" alt="" /></span></div><strong>{selected.name}</strong><span>{selected.inventory_number}</span><button onClick={() => window.print()}>Vytisknout štítek</button></div><div className="quick-actions"><h3>Rychlá akce</h3>{selected.status !== "sklad" && <button className="success" disabled={saving} onClick={() => moveTool(selected, "vraceni")}>✓ Vrátit do skladu</button>}<label>Vydat zaměstnanci<select value={holderId} onChange={(e) => setHolderId(e.target.value)}><option value="">Vyber zaměstnance</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label><button className="primary" disabled={saving} onClick={() => moveTool(selected, "vydani")}>→ Vydat / předat</button><button className="warning" disabled={saving} onClick={() => moveTool(selected, "oprava")}>⚠ Označit v opravě</button></div></div></section></div>}

    <style jsx>{`
      .tools-shell{min-height:100vh;padding:30px 34px 60px;background:#f3f6f8;color:#102536}.tools-head{max-width:1450px;margin:0 auto 22px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.eyebrow{font-size:11px;font-weight:950;letter-spacing:.12em;color:#079447;margin:0}.tools-head h1{font-size:36px;margin:5px 0}.tools-head p{color:#657886;margin:0}.primary,.success,.warning{border:0;border-radius:11px;padding:12px 16px;font-weight:900;cursor:pointer}.primary{background:#079447;color:white}.success{background:#e6f7ec;color:#08783c}.warning{background:#fff1dd;color:#9a4d00}.notice{max-width:1450px;margin:0 auto 16px;padding:12px 14px;border:1px solid #e4bd62;border-radius:12px;background:#fff7df}.stats{max-width:1450px;margin:0 auto 18px;display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.stats article{background:white;border:1px solid #dce5ea;border-radius:15px;padding:18px;display:grid;gap:4px;box-shadow:0 8px 24px rgba(16,37,54,.05)}.stats strong{font-size:29px;color:#082a49}.stats span{color:#657886;font-weight:700}.tools-card{max-width:1450px;margin:auto;background:white;border:1px solid #dce5ea;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(16,37,54,.07)}.tools-toolbar{padding:16px;display:flex;align-items:center;gap:15px;border-bottom:1px solid #e3eaee;color:#687b89}.search{flex:1;display:flex;align-items:center;border:1px solid #cdd9df;border-radius:12px;padding:0 12px}.search input{width:100%;border:0;padding:13px;background:transparent;outline:0}.tool-grid{display:grid}.tool-item{border-bottom:1px solid #edf1f3}.tool-main{width:100%;display:grid;grid-template-columns:12px minmax(220px,1fr) minmax(150px,.5fr) 110px 20px;gap:14px;align-items:center;text-align:left;padding:15px 18px;border:0;background:white;cursor:pointer}.tool-main:hover{background:#f7faf8}.tool-status{width:10px;height:10px;border-radius:99px;background:#8b9aa5}.tool-status.sklad{background:#079447}.tool-status.vydano{background:#2572d3}.tool-status.oprava{background:#e88318}.tool-copy,.tool-location{display:grid;gap:3px}.tool-copy small,.tool-location small{color:#71828e}.tool-location strong{font-size:13px}.tool-number{font-family:monospace;font-weight:900;color:#36566d}.arrow{font-size:26px;color:#7d909d}.empty{text-align:center;padding:50px;color:#71828e}.modal-backdrop{position:fixed;z-index:2000;inset:0;background:rgba(3,17,29,.58);display:grid;place-items:center;padding:20px}.modal{width:min(680px,100%);max-height:92vh;overflow:auto;background:white;border-radius:18px;padding:22px;box-shadow:0 25px 80px rgba(0,0,0,.3)}.modal-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:18px}.modal-head h2{margin:2px 0 5px}.modal-head p{margin:0;color:#687b89}.close{border:0;background:#eef2f4;width:38px;height:38px;border-radius:10px;font-size:24px;cursor:pointer}.modal label{display:grid;gap:6px;font-weight:800;margin-bottom:13px}.modal input,.modal select,.modal textarea{width:100%;border:1px solid #cbd8de;border-radius:10px;padding:11px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tool-detail{width:min(850px,100%)}.detail-number{font-family:monospace;color:#079447;font-weight:900}.detail-grid{display:grid;grid-template-columns:300px 1fr;gap:24px}.qr-label{border:1px solid #dce5ea;border-radius:15px;padding:16px;text-align:center;display:grid;gap:7px}.qr-wrap{position:relative;aspect-ratio:1;background:white}.qr{width:100%;height:100%}.qr-logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:28%;height:25%;display:grid;place-items:center;background:white;border-radius:10px;padding:4px}.qr-logo img{width:100%;height:100%;object-fit:contain}.qr-label button{border:1px solid #cbd8de;border-radius:9px;background:white;padding:9px;font-weight:800;cursor:pointer}.quick-actions{display:grid;gap:12px;align-content:start}.quick-actions h3{margin:0 0 4px}.quick-actions label{margin:0}@media(max-width:900px){.tools-shell{padding:15px}.tools-head{align-items:stretch;flex-direction:column}.stats{grid-template-columns:1fr 1fr}.tool-main{grid-template-columns:12px 1fr 20px}.tool-location,.tool-number{display:none}.detail-grid{grid-template-columns:1fr}.two{grid-template-columns:1fr}}@media print{body *{visibility:hidden}.qr-label,.qr-label *{visibility:visible}.qr-label{position:fixed;left:0;top:0;width:50mm;height:70mm;border:0}.qr-label button{display:none}}
    `}</style>
  </main>;
}
