"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type AccessLevel,
  type AppModule,
  type PermissionMap,
  type UserRole,
  appModules,
  defaultPermissionsForRole,
  hasAccess,
  moduleForPath,
  moduleLabels,
  modulePaths,
} from "@/lib/permissions";

type AccessProfile = { id: string; role: UserRole; active: boolean };
type PermissionRow = { module: AppModule; access_level: AccessLevel };

type AccessContextValue = {
  loading: boolean;
  profile: AccessProfile | null;
  permissions: PermissionMap | null;
  levelFor: (appModule: AppModule) => AccessLevel;
  canView: (appModule: AppModule) => boolean;
  canManage: (appModule: AppModule) => boolean;
  refreshPermissions: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);

  const loadPermissions = useCallback(async () => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setProfile(null);
      setPermissions(null);
      setLoading(false);
      return;
    }

    const profileResult = await supabase
      .from("profiles")
      .select("id,role,active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profileResult.data) {
      setProfile(null);
      setPermissions(null);
      setLoading(false);
      return;
    }

    const currentProfile = profileResult.data as AccessProfile;
    const fallback = defaultPermissionsForRole(currentProfile.role);
    const permissionResult = await supabase
      .from("user_module_permissions")
      .select("module,access_level")
      .eq("profile_id", currentProfile.id);

    const effective = { ...fallback };
    if (!permissionResult.error) {
      for (const row of (permissionResult.data ?? []) as PermissionRow[]) {
        if (appModules.includes(row.module)) effective[row.module] = row.access_level;
      }
    }

    if (currentProfile.role === "admin") {
      for (const appModule of appModules) effective[appModule] = "manage";
    }

    setProfile(currentProfile);
    setPermissions(effective);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Načtení vzdálených oprávnění je inicializace provideru.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPermissions();
  }, [loadPermissions]);

  const value = useMemo<AccessContextValue>(() => ({
    loading,
    profile,
    permissions,
    levelFor: (appModule) => permissions?.[appModule] ?? "none",
    canView: (appModule) => hasAccess(permissions?.[appModule] ?? "none", "view"),
    canManage: (appModule) => hasAccess(permissions?.[appModule] ?? "none", "manage"),
    refreshPermissions: loadPermissions,
  }), [loading, profile, permissions, loadPermissions]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccessControl() {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccessControl musí být uvnitř AccessProvider.");
  return context;
}

export function PermissionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, profile, canView } = useAccessControl();
  const appModule = moduleForPath(pathname);

  if (pathname === "/login" || !appModule) return children;
  if (loading) return <main className="access-loading">Ověřuji přístup…</main>;
  if (!profile) return children;
  if (canView(appModule)) return children;
  const fallbackModule = appModules.find((candidate) => canView(candidate));
  const fallbackHref = fallbackModule ? modulePaths[fallbackModule] : "/login";

  return (
    <main className="access-denied">
      <section>
        <span>OMEZENÝ PŘÍSTUP</span>
        <h1>Tuto část aplikace nemáš povolenou</h1>
        <p>Nemáš přístup k části <strong>{moduleLabels[appModule].title}</strong>. Oprávnění může změnit administrátor na stránce Zaměstnanci.</p>
        <a href={fallbackHref}>Přejít do povolené části</a>
      </section>
      <style jsx>{`
        .access-denied,.access-loading{min-height:100vh;margin-left:var(--sidebar-width);padding:100px 24px;background:#f4f7f9;color:#17374d}.access-loading{display:grid;place-items:center;font-weight:850}.access-denied{display:grid;place-items:center}.access-denied section{width:min(620px,100%);padding:32px;border:1px solid #dbe5ea;border-radius:20px;background:#fff;box-shadow:0 18px 50px rgba(16,37,54,.1)}.access-denied span{color:#b42318;font-size:11px;font-weight:950;letter-spacing:.12em}.access-denied h1{margin:8px 0;color:#082a49}.access-denied p{color:#607487;line-height:1.6}.access-denied a{display:inline-flex;margin-top:8px;padding:11px 15px;border-radius:10px;background:#08783d;color:#fff;text-decoration:none;font-weight:900}@media(max-width:900px){.access-denied,.access-loading{margin-left:0;padding-top:100px}}
      `}</style>
    </main>
  );
}
