"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "vedouci_technik" | "technik" | "sekretariat" | "servis";
  active: boolean;
};

const roleLabels: Record<Profile["role"], string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length
    ? parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("")
    : "U";
}

export default function TechnicianDashboardExpander() {
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (pathname !== "/dashboard") return;

    const supabase = createClient();
    void supabase
      .from("profiles")
      .select("id,full_name,role,active")
      .eq("active", true)
      .order("full_name", { ascending: true })
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/dashboard" || profiles.length === 0) return;

    function renderMissingRows() {
      const container = document.querySelector<HTMLElement>(".vd-technicians");
      if (!container) return;

      container.style.maxHeight = "430px";
      container.style.overflowY = "auto";
      container.style.paddingRight = "4px";

      const nativeRows = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".vd-technician:not(.vd-technician-generated)"
        )
      );

      const wantedIds = new Set(profiles.map((profile) => profile.id));
      Array.from(
        container.querySelectorAll<HTMLElement>(".vd-technician-generated")
      ).forEach((row) => {
        if (!row.dataset.profileId || !wantedIds.has(row.dataset.profileId)) {
          row.remove();
        }
      });

      profiles.slice(nativeRows.length).forEach((profile) => {
        let row = container.querySelector<HTMLElement>(
          `.vd-technician-generated[data-profile-id="${profile.id}"]`
        );

        if (!row) {
          row = document.createElement("div");
          row.className = "vd-technician vd-technician-generated";
          row.dataset.profileId = profile.id;
          row.innerHTML = `
            <div class="vd-technician-avatar"></div>
            <div>
              <strong></strong>
              <span></span>
            </div>
            <b class="vd-status office">V kanceláři</b>
          `;
          container.appendChild(row);
        }

        const avatar = row.querySelector<HTMLElement>(".vd-technician-avatar");
        const name = row.querySelector<HTMLElement>("strong");
        const role = row.querySelector<HTMLElement>("span");

        if (avatar) avatar.textContent = initials(profile.full_name);
        if (name) name.textContent = profile.full_name;
        if (role) role.textContent = roleLabels[profile.role];
      });
    }

    renderMissingRows();
    const timeout = window.setTimeout(renderMissingRows, 350);
    const interval = window.setInterval(renderMissingRows, 1800);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document
        .querySelectorAll(".vd-technician-generated")
        .forEach((element) => element.remove());
    };
  }, [pathname, profiles]);

  return null;
}
