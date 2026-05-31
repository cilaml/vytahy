"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Region = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type Elevator = {
  id: string;
  label: string;
  address: string;
  region_id: string | null;
  serial_number: string | null;
  pr_number: string | null;
  pl_number: string | null;
  status: "aktivni" | "vyrazeny";
  inspection_technician_id: string | null;
  last_op_date: string | null;
  op_interval_months: number;
  last_oz_date: string | null;
  oz_interval_months: number;
  last_ip_date: string | null;
  ip_interval_years: number;
};

type InspectionStatus = "ok" | "soon" | "overdue" | "missing";

type ElevatorPrintRow = {
  elevator: Elevator;
  regionName: string;
  opLast: string;
  opNext: Date | null;
  opStatus: InspectionStatus;
  ozLast: string;
  ozNext: Date | null;
  ozStatus: InspectionStatus;
  ipLast: string;
  ipNext: Date | null;
  ipStatus: InspectionStatus;
};

export default function InspectionsPrintPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);

  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "removed"
  >("active");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const inspectionTechnicians = useMemo(() => {
    return profiles
      .filter((profile) => profile.can_do_inspections && profile.active)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "cs"));
  }, [profiles]);

  const selectedTechnician = useMemo(() => {
    return (
      profiles.find((profile) => profile.id === selectedTechnicianId) ?? null
    );
  }, [profiles, selectedTechnicianId]);

  const printRows = useMemo(() => {
    return elevators
      .filter((elevator) => {
        if (!selectedTechnicianId) return false;

        const matchesTechnician =
          elevator.inspection_technician_id === selectedTechnicianId;

        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "active"
              ? elevator.status === "aktivni"
              : elevator.status === "vyrazeny";

        return matchesTechnician && matchesStatus;
      })
      .sort((a, b) => {
        const regionA = getRegionName(a.region_id);
        const regionB = getRegionName(b.region_id);

        const regionCompare = regionA.localeCompare(regionB, "cs");
        if (regionCompare !== 0) return regionCompare;

        return a.address.localeCompare(b.address, "cs");
      })
      .map((elevator) => {
        const opLastDate = parseDate(elevator.last_op_date);
        const opNext = opLastDate
          ? addMonths(opLastDate, elevator.op_interval_months || 3)
          : null;

        const ozLastDate = parseDate(elevator.last_oz_date);
        const ozNext = ozLastDate
          ? addMonths(ozLastDate, elevator.oz_interval_months || 36)
          : null;

        const ipLastDate = parseDate(elevator.last_ip_date);
        const ipNext = ipLastDate
          ? addYears(ipLastDate, elevator.ip_interval_years || 6)
          : null;

        return {
          elevator,
          regionName: getRegionName(elevator.region_id),
          opLast: formatStoredDate(elevator.last_op_date),
          opNext,
          opStatus: getStatus(opNext),
          ozLast: formatStoredDate(elevator.last_oz_date),
          ozNext,
          ozStatus: getStatus(ozNext),
          ipLast: formatStoredDate(elevator.last_ip_date),
          ipNext,
          ipStatus: getStatus(ipNext),
        };
      });
  }, [elevators, selectedTechnicianId, statusFilter, regions]);

  const overdueCount = useMemo(() => {
    return printRows.filter(
      (row) =>
        row.opStatus === "overdue" ||
        row.ozStatus === "overdue" ||
        row.ipStatus === "overdue"
    ).length;
  }, [printRows]);

  const soonCount = useMemo(() => {
    return printRows.filter(
      (row) =>
        row.opStatus === "soon" ||
        row.ozStatus === "soon" ||
        row.ipStatus === "soon"
    ).length;
  }, [printRows]);

  const missingCount = useMemo(() => {
    return printRows.filter(
      (row) =>
        row.opStatus === "missing" ||
        row.ozStatus === "missing" ||
        row.ipStatus === "missing"
    ).length;
  }, [printRows]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data: currentProfileData, error: currentProfileError } =
      await supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .eq("id", user.id)
        .maybeSingle();

    if (currentProfileError) {
      setMessage(`Chyba při načítání profilu: ${currentProfileError.message}`);
      setLoading(false);
      return;
    }

    if (!currentProfileData) {
      setMessage("Profil přihlášeného uživatele nebyl nalezen.");
      setLoading(false);
      return;
    }

    const [profilesResult, regionsResult, elevatorsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .order("full_name", { ascending: true }),

      supabase
        .from("regions")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase
        .from("elevators")
        .select(
          "id, label, address, region_id, serial_number, pr_number, pl_number, status, inspection_technician_id, last_op_date, op_interval_months, last_oz_date, oz_interval_months, last_ip_date, ip_interval_years"
        )
        .order("address", { ascending: true }),
    ]);

    const error =
      profilesResult.error || regionsResult.error || elevatorsResult.error;

    if (error) {
      setMessage(`Chyba při načítání dat pro tisk: ${error.message}`);
      setLoading(false);
      return;
    }

    const loadedProfiles = (profilesResult.data ?? []) as Profile[];

    setCurrentProfile(currentProfileData as Profile);
    setProfiles(loadedProfiles);
    setRegions((regionsResult.data ?? []) as Region[]);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);

    const firstTechnician = loadedProfiles.find(
      (profile) => profile.can_do_inspections && profile.active
    );

    if (firstTechnician) {
      setSelectedTechnicianId(firstTechnician.id);
    }

    setLoading(false);
  }

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    return (
      regions.find((region) => region.id === regionId)?.name ??
      "Neznámý rajon"
    );
  }

  function addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function addYears(date: Date, years: number) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  function parseDate(value: string | null) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  }

  function formatStoredDate(value: string | null) {
    if (!value) return "—";
    return new Date(`${value}T00:00:00`).toLocaleDateString("cs-CZ");
  }

  function formatDate(date: Date | null) {
    if (!date) return "—";
    return date.toLocaleDateString("cs-CZ");
  }

  function getStatus(nextDate: Date | null): InspectionStatus {
    if (!nextDate) return "missing";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limitSoon = new Date(today);
    limitSoon.setDate(limitSoon.getDate() + 30);

    if (nextDate < today) return "overdue";
    if (nextDate <= limitSoon) return "soon";
    return "ok";
  }

  function getStatusText(status: InspectionStatus) {
    if (status === "overdue") return "Po termínu";
    if (status === "soon") return "Blíží se";
    if (status === "missing") return "Nezadáno";
    return "OK";
  }

  function getStatusClass(status: InspectionStatus) {
    if (status === "overdue") return "status overdue";
    if (status === "soon") return "status soon";
    if (status === "missing") return "status missing";
    return "status ok";
  }

  if (loading) {
    return (
      <main className="screen">
        <StyleBlock />
        <div className="loading-box">Načítám tiskový výstup...</div>
      </main>
    );
  }

  return (
    <main className="screen">
      <StyleBlock />

      <section className="toolbar no-print">
        <div>
          <h1>Tisk revizí podle revizního technika</h1>
          <p>
            Vyber revizního technika a vytiskni seznam jeho výtahů s OP/OZ/IP.
          </p>
        </div>

        <div className="toolbar-actions">
          <Link href="/inspections" className="secondary-button">
            Zpět na revize
          </Link>

          <button onClick={() => window.print()} className="primary-button">
            Tisknout
          </button>
        </div>
      </section>

      {message && <div className="error-box no-print">{message}</div>}

      <section className="filters no-print">
        <label>
          <span>Revizní technik</span>
          <select
            value={selectedTechnicianId}
            onChange={(event) => setSelectedTechnicianId(event.target.value)}
          >
            <option value="">Vyber revizního technika</option>
            {inspectionTechnicians.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Stav výtahů</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "active" | "removed")
            }
          >
            <option value="active">Jen aktivní</option>
            <option value="all">Všechny</option>
            <option value="removed">Jen vyřazené</option>
          </select>
        </label>
      </section>

      <section className="print-page">
        <header className="print-header">
          <div>
            <div className="company">Výtahy Servis</div>
            <h1>Seznam výtahů pro revizního technika</h1>
          </div>

          <div className="print-meta">
            <div>
              <span>Revizní technik</span>
              <strong>{selectedTechnician?.full_name ?? "—"}</strong>
            </div>

            <div>
              <span>Vytištěno</span>
              <strong>{new Date().toLocaleDateString("cs-CZ")}</strong>
            </div>

            <div>
              <span>Počet výtahů</span>
              <strong>{printRows.length}</strong>
            </div>
          </div>
        </header>

        <section className="summary">
          <div>
            <span>Po termínu</span>
            <strong>{overdueCount}</strong>
          </div>

          <div>
            <span>Blíží se</span>
            <strong>{soonCount}</strong>
          </div>

          <div>
            <span>Chybí datum</span>
            <strong>{missingCount}</strong>
          </div>

          <div>
            <span>Filtr</span>
            <strong>
              {statusFilter === "active"
                ? "Aktivní výtahy"
                : statusFilter === "removed"
                  ? "Vyřazené výtahy"
                  : "Všechny výtahy"}
            </strong>
          </div>
        </section>

        {!selectedTechnicianId ? (
          <div className="empty-print">Vyber revizního technika.</div>
        ) : printRows.length === 0 ? (
          <div className="empty-print">
            Pro vybraného revizního technika nejsou nalezené žádné výtahy.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Adresa</th>
                <th>Výtah</th>
                <th>Rajon</th>
                <th>PR</th>
                <th>PL</th>
                <th>Výr. č.</th>
                <th>OP poslední</th>
                <th>OP další</th>
                <th>OZ poslední</th>
                <th>OZ další</th>
                <th>IP poslední</th>
                <th>IP další</th>
              </tr>
            </thead>

            <tbody>
              {printRows.map((row) => (
                <tr key={row.elevator.id}>
                  <td>
                    <strong>{row.elevator.address}</strong>
                  </td>
                  <td>{row.elevator.label}</td>
                  <td>{row.regionName}</td>
                  <td>{row.elevator.pr_number || "—"}</td>
                  <td>{row.elevator.pl_number || "—"}</td>
                  <td>{row.elevator.serial_number || "—"}</td>

                  <td>{row.opLast}</td>
                  <td>
                    <div className={getStatusClass(row.opStatus)}>
                      <strong>{formatDate(row.opNext)}</strong>
                      <span>{getStatusText(row.opStatus)}</span>
                    </div>
                  </td>

                  <td>{row.ozLast}</td>
                  <td>
                    <div className={getStatusClass(row.ozStatus)}>
                      <strong>{formatDate(row.ozNext)}</strong>
                      <span>{getStatusText(row.ozStatus)}</span>
                    </div>
                  </td>

                  <td>{row.ipLast}</td>
                  <td>
                    <div className={getStatusClass(row.ipStatus)}>
                      <strong>{formatDate(row.ipNext)}</strong>
                      <span>{getStatusText(row.ipStatus)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="print-footer">
          <div>Podpis revizního technika: __________________________</div>
          <div>Poznámka: __________________________________________</div>
        </footer>
      </section>
    </main>
  );
}

function StyleBlock() {
  return (
    <style>{`
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #e5e7eb;
        color: #111827;
      }

      .screen {
        min-height: 100vh;
        padding: 24px;
        background: #e5e7eb;
      }

      .toolbar {
        max-width: 1500px;
        margin: 0 auto 18px;
        background: #0f172a;
        color: white;
        border-radius: 20px;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
      }

      .toolbar h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 950;
      }

      .toolbar p {
        color: #cbd5e1;
        margin: 8px 0 0;
      }

      .toolbar-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .primary-button,
      .secondary-button {
        border: 0;
        border-radius: 13px;
        padding: 12px 18px;
        font-weight: 900;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .primary-button {
        background: #2563eb;
        color: white;
      }

      .secondary-button {
        background: #1e293b;
        border: 1px solid #334155;
        color: white;
      }

      .filters {
        max-width: 1500px;
        margin: 0 auto 18px;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 18px;
        padding: 16px;
        display: grid;
        grid-template-columns: 1fr 240px;
        gap: 14px;
      }

      .filters label {
        display: grid;
        gap: 7px;
      }

      .filters span {
        font-size: 13px;
        font-weight: 900;
        color: #374151;
      }

      .filters select {
        width: 100%;
        border: 1px solid #9ca3af;
        border-radius: 12px;
        padding: 12px;
        font-size: 15px;
      }

      .error-box {
        max-width: 1500px;
        margin: 0 auto 18px;
        background: #fee2e2;
        border: 1px solid #ef4444;
        color: #7f1d1d;
        padding: 12px;
        border-radius: 12px;
      }

      .loading-box {
        max-width: 900px;
        margin: 60px auto;
        background: white;
        border-radius: 18px;
        padding: 28px;
        text-align: center;
        font-weight: 900;
      }

      .print-page {
        max-width: 1500px;
        margin: 0 auto;
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 18px;
        padding: 26px;
      }

      .print-header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
        border-bottom: 2px solid #111827;
        padding-bottom: 18px;
        margin-bottom: 18px;
      }

      .company {
        font-size: 14px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #4b5563;
      }

      .print-header h1 {
        margin: 6px 0 0;
        font-size: 28px;
        line-height: 1.15;
      }

      .print-meta {
        display: grid;
        gap: 8px;
        min-width: 260px;
      }

      .print-meta div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 5px;
      }

      .print-meta span {
        color: #6b7280;
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-bottom: 18px;
      }

      .summary div {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 12px;
      }

      .summary span {
        display: block;
        color: #6b7280;
        font-size: 13px;
        font-weight: 800;
      }

      .summary strong {
        display: block;
        margin-top: 5px;
        font-size: 20px;
      }

      .empty-print {
        border: 1px dashed #9ca3af;
        border-radius: 12px;
        padding: 22px;
        text-align: center;
        color: #6b7280;
        font-weight: 800;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      th,
      td {
        border: 1px solid #d1d5db;
        padding: 7px;
        vertical-align: top;
      }

      th {
        background: #f3f4f6;
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      tr:nth-child(even) td {
        background: #fafafa;
      }

      .status {
        display: grid;
        gap: 2px;
      }

      .status span {
        font-size: 10px;
        font-weight: 900;
      }

      .status.ok span {
        color: #166534;
      }

      .status.soon span {
        color: #c2410c;
      }

      .status.overdue span {
        color: #b91c1c;
      }

      .status.missing span {
        color: #1d4ed8;
      }

      .status.overdue strong {
        color: #b91c1c;
      }

      .status.soon strong {
        color: #c2410c;
      }

      .status.missing strong {
        color: #1d4ed8;
      }

      .print-footer {
        margin-top: 28px;
        display: grid;
        gap: 16px;
        font-size: 14px;
      }

      @media (max-width: 800px) {
        .screen {
          padding: 12px;
        }

        .toolbar {
          display: grid;
        }

        .toolbar-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .primary-button,
        .secondary-button {
          width: 100%;
          min-height: 48px;
        }

        .filters {
          grid-template-columns: 1fr;
        }

        .print-page {
          padding: 14px;
          overflow-x: auto;
        }

        .print-header {
          display: grid;
        }

        .summary {
          grid-template-columns: 1fr;
        }
      }

      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        body {
          background: white;
        }

        .screen {
          padding: 0;
          background: white;
        }

        .no-print {
          display: none !important;
        }

        .print-page {
          max-width: none;
          margin: 0;
          border: 0;
          border-radius: 0;
          padding: 0;
        }

        .print-header {
          page-break-inside: avoid;
        }

        .summary {
          page-break-inside: avoid;
        }

        table {
          font-size: 9.5px;
        }

        th,
        td {
          padding: 4px;
        }

        .print-footer {
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}