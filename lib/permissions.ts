export const appModules = [
  "dashboard",
  "planned_actions",
  "faults",
  "service",
  "inspections",
  "messages",
  "elevators",
  "technicians",
  "regions",
  "tools",
  "notifications",
] as const;

export type AppModule = (typeof appModules)[number];
export type AccessLevel = "none" | "view" | "manage";
export type UserRole = "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
export type PermissionMap = Record<AppModule, AccessLevel>;

export const moduleLabels: Record<AppModule, { title: string; detail: string }> = {
  dashboard: { title: "Hlavní přehled", detail: "Souhrn firmy, kalendář a rychlé přehledy." },
  planned_actions: { title: "Plán práce", detail: "Kalendář, pracovní akce a jejich stavy." },
  faults: { title: "Poruchy", detail: "Příjem, řešení a dokončování poruch." },
  service: { title: "Servisní zásahy", detail: "Zápisy ze servisu a fotodokumentace." },
  inspections: { title: "Prohlídky a zkoušky", detail: "OP, OZ, IP a tisk záznamů." },
  messages: { title: "Zprávy", detail: "Firemní zprávy a reakce zaměstnanců." },
  elevators: { title: "Výtahy", detail: "Evidence výtahů a jejich technické údaje." },
  technicians: { title: "Zaměstnanci", detail: "Účty, role, dovolené a oprávnění." },
  regions: { title: "Regiony", detail: "Správa rajonů a přiřazení výtahů." },
  tools: { title: "Nářadí", detail: "Evidence, výdeje a checklisty na akce." },
  notifications: { title: "Upozornění", detail: "Push upozornění a jejich nastavení." },
};

export const accessLevelLabels: Record<AccessLevel, string> = {
  none: "Bez přístupu",
  view: "Pouze čtení",
  manage: "Může upravovat",
};

export const modulePaths: Record<AppModule, string> = {
  dashboard: "/dashboard",
  planned_actions: "/planned-actions",
  faults: "/faults",
  service: "/service",
  inspections: "/inspections",
  messages: "/messages",
  elevators: "/elevators",
  technicians: "/technicians",
  regions: "/regions",
  tools: "/tools",
  notifications: "/notifications",
};

export const emptyPermissionMap = (): PermissionMap => Object.fromEntries(
  appModules.map((appModule) => [appModule, "none"])
) as PermissionMap;

export function defaultPermissionsForRole(role: UserRole): PermissionMap {
  const result = emptyPermissionMap();

  if (role === "admin" || role === "vedouci_technik") {
    for (const appModule of appModules) result[appModule] = "manage";
    return result;
  }

  if (role === "sekretariat") {
    for (const appModule of appModules) result[appModule] = "view";
    for (const appModule of ["dashboard", "planned_actions", "faults", "messages", "technicians", "regions", "notifications"] as AppModule[]) {
      result[appModule] = "manage";
    }
    return result;
  }

  if (role === "servis") {
    for (const appModule of appModules) result[appModule] = "view";
    for (const appModule of ["planned_actions", "faults", "service", "messages", "tools"] as AppModule[]) {
      result[appModule] = "manage";
    }
    return result;
  }

  for (const appModule of ["dashboard", "inspections", "messages", "elevators", "regions", "notifications"] as AppModule[]) {
    result[appModule] = "view";
  }
  for (const appModule of ["planned_actions", "faults", "service", "tools"] as AppModule[]) {
    result[appModule] = "manage";
  }
  return result;
}

export function moduleForPath(pathname: string): AppModule | null {
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/planned-actions")) return "planned_actions";
  if (pathname.startsWith("/faults")) return "faults";
  if (pathname.startsWith("/service")) return "service";
  if (pathname.startsWith("/inspections")) return "inspections";
  if (pathname.startsWith("/messages")) return "messages";
  if (pathname.startsWith("/elevators")) return "elevators";
  if (pathname.startsWith("/technicians")) return "technicians";
  if (pathname.startsWith("/regions")) return "regions";
  if (pathname.startsWith("/tools")) return "tools";
  if (pathname.startsWith("/notifications")) return "notifications";
  return null;
}

export function hasAccess(level: AccessLevel, required: Exclude<AccessLevel, "none">) {
  if (level === "manage") return true;
  return required === "view" && level === "view";
}
