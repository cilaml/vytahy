"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAccessControl } from "@/components/AccessControl";
import {
  type AccessLevel,
  type AppModule,
  type PermissionMap,
  type UserRole,
  accessLevelLabels,
  appModules,
  defaultPermissionsForRole,
  emptyPermissionMap,
  moduleLabels,
} from "@/lib/permissions";

type PermissionRow = { module: AppModule; access_level: AccessLevel };

function readOnlyPreset() {
  return Object.fromEntries(appModules.map((appModule) => [appModule, "view"])) as PermissionMap;
}

function fullPreset() {
  return Object.fromEntries(appModules.map((appModule) => [appModule, "manage"])) as PermissionMap;
}

function calendarAndFaultsPreset() {
  const preset = emptyPermissionMap();
  preset.planned_actions = "manage";
  preset.faults = "manage";
  return preset;
}

export default function ModulePermissionEditor({
  profileId,
  role,
  profileName,
}: {
  profileId: string;
  role: UserRole;
  profileName: string;
}) {
  const { profile: currentProfile, refreshPermissions } = useAccessControl();
  const [permissions, setPermissions] = useState<PermissionMap>(() => defaultPermissionsForRole(role));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const adminAccount = role === "admin";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage("");
      const fallback = defaultPermissionsForRole(role);
      const supabase = createClient();
      const result = await supabase
        .from("user_module_permissions")
        .select("module,access_level")
        .eq("profile_id", profileId);

      if (cancelled) return;
      if (result.error) {
        setPermissions(fallback);
        setMessage("Oprávnění se nepodařilo načíst. Nejdřív bude potřeba spustit připravenou databázovou migraci.");
      } else {
        const effective = { ...fallback };
        for (const row of (result.data ?? []) as PermissionRow[]) effective[row.module] = row.access_level;
        if (adminAccount) for (const appModule of appModules) effective[appModule] = "manage";
        setPermissions(effective);
      }
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [profileId, role, adminAccount]);

  const enabledCount = useMemo(
    () => appModules.filter((appModule) => permissions[appModule] !== "none").length,
    [permissions]
  );

  function applyPreset(next: PermissionMap) {
    if (adminAccount) return;
    setPermissions(next);
    setSuccess("");
  }

  async function save() {
    if (!currentProfile || adminAccount) return;
    setSaving(true);
    setMessage("");
    setSuccess("");
    const supabase = createClient();
    const result = await supabase.from("user_module_permissions").upsert(
      appModules.map((appModule) => ({
        profile_id: profileId,
        module: appModule,
        access_level: permissions[appModule],
        updated_at: new Date().toISOString(),
        updated_by: currentProfile.id,
      })),
      { onConflict: "profile_id,module" }
    );

    setSaving(false);
    if (result.error) {
      setMessage(`Oprávnění se nepovedlo uložit: ${result.error.message}`);
      return;
    }
    setSuccess(`Přístup pro ${profileName} byl uložen.`);
    if (currentProfile.id === profileId) await refreshPermissions();
  }

  return (
    <section className="permission-editor">
      <header>
        <div>
          <span>PŘÍSTUP DO APLIKACE</span>
          <h3>Co smí {profileName}</h3>
          <p>{enabledCount} z {appModules.length} částí aplikace je povolených. „Pouze čtení“ dovolí prohlížení, ale databáze odmítne úpravy.</p>
        </div>
        <strong>{adminAccount ? "Plný přístup" : `${enabledCount}/${appModules.length}`}</strong>
      </header>

      {adminAccount ? (
        <div className="admin-info">Administrátorský účet má vždy plný přístup, aby nešlo omylem zablokovat správu aplikace.</div>
      ) : (
        <>
          <div className="permission-presets">
            <button type="button" onClick={() => applyPreset(calendarAndFaultsPreset())}>Jen kalendář a poruchy</button>
            <button type="button" onClick={() => applyPreset(defaultPermissionsForRole(role))}>Výchozí podle role</button>
            <button type="button" onClick={() => applyPreset(readOnlyPreset())}>Všude jen čtení</button>
            <button type="button" onClick={() => applyPreset(fullPreset())}>Plný přístup</button>
          </div>

          <div className="permission-list">
            {appModules.map((appModule) => (
              <label key={appModule}>
                <span><strong>{moduleLabels[appModule].title}</strong><small>{moduleLabels[appModule].detail}</small></span>
                <select
                  value={permissions[appModule]}
                  onChange={(event) => setPermissions((current) => ({ ...current, [appModule]: event.target.value as AccessLevel }))}
                  disabled={loading || saving}
                  className={permissions[appModule]}
                >
                  {(Object.keys(accessLevelLabels) as AccessLevel[]).map((level) => <option key={level} value={level}>{accessLevelLabels[level]}</option>)}
                </select>
              </label>
            ))}
          </div>

          {message && <div className="permission-message error">{message}</div>}
          {success && <div className="permission-message success">{success}</div>}
          <button type="button" className="permission-save" onClick={() => void save()} disabled={loading || saving}>{saving ? "Ukládám přístup…" : "Uložit oprávnění"}</button>
        </>
      )}

      <style jsx>{`
        .permission-editor{margin:22px 0;padding:20px;border:1px solid #cfe0d6;border-radius:17px;background:#f7fbf8;color:#17374d}.permission-editor header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}.permission-editor header span{color:#079447;font-size:10px;font-weight:950;letter-spacing:.12em}.permission-editor h3{margin:5px 0;color:#082a49;font-size:20px}.permission-editor header p{max-width:700px;margin:0;color:#607487;font-size:13px;line-height:1.5}.permission-editor header>strong{padding:8px 10px;border-radius:999px;background:#e2f4e8;color:#08783d;font-size:12px;white-space:nowrap}.permission-presets{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.permission-presets button{padding:8px 10px;border:1px solid #c8d9d0;border-radius:9px;background:#fff;color:#315064;font-weight:850;cursor:pointer}.permission-presets button:first-child{border-color:#8bc5a1;background:#eaf8ef;color:#08783d}.permission-list{overflow:hidden;border:1px solid #d8e5dd;border-radius:13px;background:#fff}.permission-list label{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:15px;align-items:center;padding:12px 14px;border-bottom:1px solid #edf2ef}.permission-list label:last-child{border-bottom:0}.permission-list label>span{display:grid;gap:3px}.permission-list small{color:#718195;font-size:12px}.permission-list select{min-height:39px;padding:0 9px;border:1px solid #ccd9df;border-radius:9px;background:#fff;color:#294052;font-weight:850}.permission-list select.none{border-color:#e2baba;background:#fff4f4;color:#a12b2b}.permission-list select.manage{border-color:#9bc9ac;background:#eff9f2;color:#08783d}.permission-save{width:100%;min-height:44px;margin-top:14px;border:0;border-radius:10px;background:#08783d;color:#fff;font-weight:950;cursor:pointer}.permission-save:disabled{opacity:.6;cursor:not-allowed}.permission-message,.admin-info{margin-top:12px;padding:11px 12px;border-radius:10px;font-weight:750}.permission-message.error{background:#fff1f1;color:#a12b2b}.permission-message.success,.admin-info{background:#eaf8ef;color:#08783d}@media(max-width:650px){.permission-editor{padding:15px}.permission-editor header{flex-direction:column}.permission-list label{grid-template-columns:1fr}.permission-list select{width:100%}}
      `}</style>
    </section>
  );
}
