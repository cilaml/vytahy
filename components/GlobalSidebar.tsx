"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccessControl } from "@/components/AccessControl";
import { appModules, modulePaths, type AppModule } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  module: AppModule;
};

type Group = {
  label: string;
  icon: string;
  items: NavItem[];
};

const groups: Group[] = [
  {
    label: "Plánování",
    icon: "▦",
    items: [{ href: "/planned-actions", label: "Plán práce", icon: "▣", module: "planned_actions" }],
  },
  {
    label: "Servis",
    icon: "⚙",
    items: [
      { href: "/faults", label: "Poruchy", icon: "!", module: "faults" },
      { href: "/service", label: "Servisní zásahy", icon: "⌁", module: "service" },
      { href: "/inspections", label: "Prohlídky a zkoušky", icon: "✓", module: "inspections" },
      { href: "/messages", label: "Zprávy", icon: "✉", module: "messages" },
    ],
  },
  {
    label: "Evidence",
    icon: "▤",
    items: [
      { href: "/elevators", label: "Výtahy", icon: "↕", module: "elevators" },
      { href: "/technicians", label: "Zaměstnanci", icon: "♙", module: "technicians" },
      { href: "/regions", label: "Regiony", icon: "⌖", module: "regions" },
    ],
  },
  {
    label: "Nářadí",
    icon: "⌕",
    items: [{ href: "/tools", label: "Evidence nářadí", icon: "▧", module: "tools" }],
  },
];

export default function GlobalSidebar() {
  const pathname = usePathname();
  const { loading, canView, canManage } = useAccessControl();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initialOpen = useMemo(() => groups.map((group) => group.label), []);
  const [openGroups, setOpenGroups] = useState<string[]>(initialOpen);
  const homeHref = appModules.find((appModule) => canView(appModule));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/faults" || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const createButton = document.querySelector<HTMLButtonElement>(
        ".content .topbar .primary-action"
      );

      if (createButton) {
        createButton.click();
        window.clearInterval(timer);
        window.setTimeout(() => {
          document.querySelector(".content .form-card")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 120);
        window.history.replaceState({}, "", "/faults");
      } else if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [pathname]);

  if (pathname === "/login") return null;

  function toggle(label: string) {
    setOpenGroups((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    );
  }

  return (
    <>
      <button
        className="global-menu-button"
        onClick={() => setMobileOpen((value) => !value)}
        aria-label="Otevřít menu"
      >
        ☰
      </button>

      {mobileOpen && (
        <button
          className="global-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-label="Zavřít menu"
        />
      )}

      <aside className={`global-sidebar ${mobileOpen ? "open" : ""}`}>
        <a className="global-brand" href={homeHref ? modulePaths[homeHref] : pathname} aria-label="Výtahy DC – přehled">
          <img src="/vytahy-dc-mark.svg" alt="Výtahy DC" />
        </a>

        <nav className="global-nav">
          {canView("dashboard") && <a
            className={`global-main-link ${pathname === "/dashboard" ? "active" : ""}`}
            href="/dashboard"
          >
            <span className="global-main-icon">⌂</span>
            <span>Přehled</span>
          </a>}

          {groups.map((group) => ({ ...group, items: group.items.filter((item) => canView(item.module)) })).filter((group) => group.items.length > 0).map((group) => {
            const open = openGroups.includes(group.label);
            const active = group.items.some((item) => pathname.startsWith(item.href));

            return (
              <section className="global-nav-group" key={group.label}>
                <button
                  className={active ? "active" : ""}
                  onClick={() => toggle(group.label)}
                  type="button"
                >
                  <span className="global-nav-icon">{group.icon}</span>
                  <span className="global-nav-label">{group.label}</span>
                  <span className="global-chevron">{open ? "⌃" : "⌄"}</span>
                </button>

                {open && (
                  <div className="global-subnav">
                    {group.items.map((item) => (
                      <a
                        key={item.href}
                        className={pathname.startsWith(item.href) ? "active" : ""}
                        href={item.href}
                      >
                        <span>{item.icon}</span>
                        {item.label}
                      </a>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="global-sidebar-footer">
          <span className="status-dot" />
          <span>Verze 1.0.0</span>
        </div>
      </aside>

      {!loading && pathname === "/dashboard" && canManage("faults") && (
        <a className="dashboard-fault-fab" href="/faults?new=1">
          <span>!</span>
          <strong>Rychle založit poruchu</strong>
        </a>
      )}
    </>
  );
}
