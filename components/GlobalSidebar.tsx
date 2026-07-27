"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Group = {
  label: string;
  icon: string;
  items: { href: string; label: string; icon: string }[];
};

const groups: Group[] = [
  {
    label: "Plánování",
    icon: "▦",
    items: [
      { href: "/planned-actions", label: "Kalendář a plán práce", icon: "▣" },
    ],
  },
  {
    label: "Servis",
    icon: "⚙",
    items: [
      { href: "/faults", label: "Poruchy", icon: "!" },
      { href: "/service", label: "Servisní zásahy", icon: "⌁" },
      { href: "/inspections", label: "Prohlídky a zkoušky", icon: "✓" },
      { href: "/messages", label: "Zprávy", icon: "✉" },
    ],
  },
  {
    label: "Evidence",
    icon: "▤",
    items: [
      { href: "/elevators", label: "Výtahy", icon: "↕" },
      { href: "/technicians", label: "Zaměstnanci", icon: "♙" },
      { href: "/regions", label: "Rajony", icon: "⌖" },
    ],
  },
  {
    label: "Nářadí",
    icon: "⌕",
    items: [
      { href: "/tools", label: "Evidence nářadí", icon: "▧" },
    ],
  },
];

export default function GlobalSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const initialOpen = useMemo(
    () => groups.find((group) => group.items.some((item) => pathname.startsWith(item.href)))?.label ?? "Servis",
    [pathname]
  );
  const [openGroups, setOpenGroups] = useState<string[]>([initialOpen]);

  useEffect(() => {
    const group = groups.find((item) => item.items.some((link) => pathname.startsWith(link.href)));
    if (group) setOpenGroups((current) => current.includes(group.label) ? current : [...current, group.label]);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      setUserName(profile?.full_name ?? data.user.email ?? "Uživatel");
    });
  }, []);

  if (pathname === "/login") return null;

  function toggle(label: string) {
    setOpenGroups((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }

  return (
    <>
      <button className="global-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label="Otevřít menu">☰</button>
      {mobileOpen && <button className="global-sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Zavřít menu" />}
      <aside className={`global-sidebar ${mobileOpen ? "open" : ""}`}>
        <a className="global-brand" href="/dashboard"><img src="/vytahy-dc-logo.svg" alt="Výtahy DC" /></a>
        <div className="global-user"><span>Přihlášený uživatel</span><strong>{userName || "Načítám..."}</strong></div>
        <nav>
          <a className={`global-main-link ${pathname === "/dashboard" ? "active" : ""}`} href="/dashboard"><span>⌂</span>Přehled</a>
          {groups.map((group) => {
            const open = openGroups.includes(group.label);
            const active = group.items.some((item) => pathname.startsWith(item.href));
            return <section className="global-nav-group" key={group.label}>
              <button className={active ? "active" : ""} onClick={() => toggle(group.label)}>
                <span className="global-nav-icon">{group.icon}</span><span>{group.label}</span><span className="global-chevron">{open ? "⌃" : "⌄"}</span>
              </button>
              {open && <div className="global-subnav">{group.items.map((item) => <a key={item.href} className={pathname.startsWith(item.href) ? "active" : ""} href={item.href}><span>{item.icon}</span>{item.label}</a>)}</div>}
            </section>;
          })}
        </nav>
        <div className="global-sidebar-footer"><span className="status-dot" /> Servisní systém Výtahy DC</div>
      </aside>
    </>
  );
}
