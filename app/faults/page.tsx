"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRole =
  | "admin"
  | "vedouci_technik"
  | "technik"
  | "sekretariat"
  | "servis";

type FaultPriority = "bezna" | "dulezita" | "odstavka" | "uvizle_osoby";

type FaultStatus =
  | "nova"
  | "prirazeno"
  | "na_ceste"
  | "rozpracovano"
  | "ceka_na_dil"
  | "ceka_na_spravce"
  | "ceka_na_pristup"
  | "ceka_na_zakaznika"
  | "hotovo"
  | "archivovano";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
};

type ProfileRegion = {
  id: string;
  profile_id: string;
  region_id: string;
};

type Elevator = {
  id: string;
  label: string;
  address: string;
  region_id: string | null;
  pr_number: string | null;
  pl_number: string | null;
  serial_number: string | null;
};

type Region = {
  id: string;
  name: string;
};

type Fault = {
  id: string;
  elevator_id: string;
  region_id: string | null;
  priority: FaultPriority;
  status: FaultStatus;
  description: string;
  created_by: string | null;
  main_technician_id: string | null;
  created_at: string;
  finished_at: string | null;
  archived_at: string | null;
};

type FaultAssignee = {
  id: string;
  fault_id: string;
  profile_id: string;
  role: "hlavni" | "spolupracovnik";
};

type FaultNote = {
  id: string;
  fault_id: string;
  profile_id: string | null;
  note: string;
  created_at: string;
};

type FaultForm = {
  elevator_id: string;
  priority: FaultPriority;
  description: string;
  main_technician_id: string;
  helper_ids: string[];
  note: string;
};

const emptyForm: FaultForm = {
  elevator_id: "",
  priority: "bezna",
  description: "",
  main_technician_id: "",
  helper_ids: [],
  note: "",
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const priorityLabels: Record<FaultPriority, string> = {
  bezna: "Běžná",
  dulezita: "Důležitá",
  odstavka: "Odstávka",
  uvizle_osoby: "Uvízlé osoby",
};

const statusLabels: Record<FaultStatus, string> = {
  nova: "Nová",
  prirazeno: "Přiřazeno",
  na_ceste: "Na cestě",
  rozpracovano: "Rozpracováno",
  ceka_na_dil: "Čeká na díl",
  ceka_na_spravce: "Čeká na správce",
  ceka_na_pristup: "Čeká na přístup",
  ceka_na_zakaznika: "Čeká na zákazníka",
  hotovo: "Hotovo",
  archivovano: "Archivováno",
};

const activeStatuses: FaultStatus[] = [
  "nova",
  "prirazeno",
  "na_ceste",
  "rozpracovano",
  "ceka_na_dil",
  "ceka_na_spravce",
  "ceka_na_pristup",
  "ceka_na_zakaznika",
];

export default function FaultsPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [faults, setFaults] = useState<Fault[]>([]);
  const [faultAssignees, setFaultAssignees] = useState<FaultAssignee[]>([]);
  const [faultNotes, setFaultNotes] = useState<FaultNote[]>([]);

  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);

  const [form, setForm] = useState<FaultForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingFaultId, setEditingFaultId] = useState<string | null>(null);
  const [elevatorQuery, setElevatorQuery] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "done" | "archive" | "all"
  >("active");
  const [regionFilter, setRegionFilter] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<FaultPriority | "all">(
    "all"
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  useEffect(() => {
    loadData();
  }, []);

  function getUserRegionIds() {
    if (!currentProfile) return [];

    const secondary = profileRegions
      .filter((item) => item.profile_id === currentProfile.id)
      .map((item) => item.region_id);

    return [currentProfile.primary_region_id, ...secondary].filter(
      Boolean
    ) as string[];
  }

  function getElevator(elevatorId: string) {
    return elevators.find((item) => item.id === elevatorId) ?? null;
  }

  function getElevatorLabel(elevatorId: string) {
    const elevator = getElevator(elevatorId);
    if (!elevator) return "Neznámý výtah";

    return `${elevator.address} — ${elevator.label}`;
  }

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Bez rajonu";

    return (
      regions.find((item) => item.id === regionId)?.name ?? "Neznámý rajon"
    );
  }

  function getProfileName(profileId: string | null) {
    if (!profileId) return "Nepřiřazen";

    return (
      profiles.find((item) => item.id === profileId)?.full_name ??
      "Neznámý technik"
    );
  }

  function getHelpersForFault(faultId: string) {
    return faultAssignees
      .filter(
        (item) => item.fault_id === faultId && item.role === "spolupracovnik"
      )
      .map((item) => getProfileName(item.profile_id));
  }

  function getNotesForFault(faultId: string) {
    return faultNotes
      .filter((item) => item.fault_id === faultId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function getElevatorSearchText(elevator: Elevator) {
    return [
      elevator.address,
      elevator.label,
      elevator.pr_number,
      elevator.pl_number,
      elevator.serial_number,
      getRegionName(elevator.region_id),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function isFaultAssignedToMe(fault: Fault) {
    if (!currentProfile) return false;

    if (fault.main_technician_id === currentProfile.id) return true;

    return faultAssignees.some(
      (item) =>
        item.fault_id === fault.id &&
        item.profile_id === currentProfile.id &&
        item.role === "spolupracovnik"
    );
  }

  function isFaultVisibleForUser(fault: Fault) {
    if (!currentProfile) return false;

    if (isAdminOrLead) return true;

    if (isFaultAssignedToMe(fault)) return true;

    const userRegionIds = getUserRegionIds();

    return fault.region_id ? userRegionIds.includes(fault.region_id) : false;
  }

  const visibleFaults = useMemo(() => {
    return faults.filter((fault) => isFaultVisibleForUser(fault));
  }, [faults, currentProfile, profileRegions, faultAssignees]);

  const elevatorSuggestions = useMemo(() => {
    const text = elevatorQuery.trim().toLowerCase();

    const visibleElevators =
      isAdminOrLead || !currentProfile
        ? elevators
        : elevators.filter((elevator) => {
            const userRegionIds = getUserRegionIds();
            return elevator.region_id
              ? userRegionIds.includes(elevator.region_id)
              : false;
          });

    if (!text) {
      return visibleElevators.slice(0, 8);
    }

    return visibleElevators
      .filter((elevator) =>
        getElevatorSearchText(elevator).toLowerCase().includes(text)
      )
      .slice(0, 12);
  }, [elevators, elevatorQuery, regions, currentProfile, profileRegions]);

  const sortedTechniciansForSelectedElevator = useMemo(() => {
    const selectedElevator = elevators.find(
      (item) => item.id === form.elevator_id
    );

    if (!selectedElevator?.region_id) {
      return profiles.filter((profile) => profile.active);
    }

    return profiles
      .filter((profile) => profile.active)
      .sort((a, b) => {
        const aPrimary =
          a.primary_region_id === selectedElevator.region_id ? 0 : 1;
        const bPrimary =
          b.primary_region_id === selectedElevator.region_id ? 0 : 1;

        if (aPrimary !== bPrimary) return aPrimary - bPrimary;

        return a.full_name.localeCompare(b.full_name, "cs");
      });
  }, [profiles, elevators, form.elevator_id]);

  const filteredFaults = useMemo(() => {
    const text = search.trim().toLowerCase();

    return visibleFaults.filter((fault) => {
      const elevator = getElevator(fault.elevator_id);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? activeStatuses.includes(fault.status)
            : statusFilter === "done"
              ? fault.status === "hotovo"
              : fault.status === "archivovano";

      const matchesRegion = regionFilter
        ? fault.region_id === regionFilter
        : true;

      const matchesTechnician = technicianFilter
        ? fault.main_technician_id === technicianFilter ||
          faultAssignees.some(
            (item) =>
              item.fault_id === fault.id && item.profile_id === technicianFilter
          )
        : true;

      const matchesPriority =
        priorityFilter === "all" ? true : fault.priority === priorityFilter;

      const searchable = [
        fault.description,
        priorityLabels[fault.priority],
        statusLabels[fault.status],
        elevator?.label,
        elevator?.address,
        elevator?.pr_number,
        elevator?.pl_number,
        elevator?.serial_number,
        getProfileName(fault.main_technician_id),
        getRegionName(fault.region_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = text ? searchable.includes(text) : true;

      return (
        matchesStatus &&
        matchesRegion &&
        matchesTechnician &&
        matchesPriority &&
        matchesSearch
      );
    });
  }, [
    visibleFaults,
    search,
    statusFilter,
    regionFilter,
    technicianFilter,
    priorityFilter,
    elevators,
    profiles,
    regions,
    faultAssignees,
  ]);

  const orderedFaults = useMemo(() => {
    return [...filteredFaults].sort((a, b) => {
      if (a.priority === "uvizle_osoby" && b.priority !== "uvizle_osoby") {
        return -1;
      }

      if (a.priority !== "uvizle_osoby" && b.priority === "uvizle_osoby") {
        return 1;
      }

      return b.created_at.localeCompare(a.created_at);
    });
  }, [filteredFaults]);

  const activeFaultsCount = visibleFaults.filter((fault) =>
    activeStatuses.includes(fault.status)
  ).length;

  const trappedFaultsCount = visibleFaults.filter(
    (fault) =>
      fault.priority === "uvizle_osoby" && activeStatuses.includes(fault.status)
  ).length;

  const myFaultsCount = visibleFaults.filter((fault) =>
    isFaultAssignedToMe(fault)
  ).length;

  async function loadData() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

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

    const [
      faultsResult,
      assigneesResult,
      notesResult,
      elevatorsResult,
      regionsResult,
      profilesResult,
      profileRegionsResult,
    ] = await Promise.all([
      supabase
        .from("faults")
        .select(
          "id, elevator_id, region_id, priority, status, description, created_by, main_technician_id, created_at, finished_at, archived_at"
        )
        .order("created_at", { ascending: false }),

      supabase.from("fault_assignees").select("id, fault_id, profile_id, role"),

      supabase
        .from("fault_notes")
        .select("id, fault_id, profile_id, note, created_at"),

      supabase
        .from("elevators")
        .select(
          "id, label, address, region_id, pr_number, pl_number, serial_number"
        )
        .order("address", { ascending: true }),

      supabase
        .from("regions")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, primary_region_id, can_do_inspections, active"
        )
        .eq("active", true)
        .order("full_name", { ascending: true }),

      supabase.from("profile_regions").select("id, profile_id, region_id"),
    ]);

    const error =
      faultsResult.error ||
      assigneesResult.error ||
      notesResult.error ||
      elevatorsResult.error ||
      regionsResult.error ||
      profilesResult.error ||
      profileRegionsResult.error;

    if (error) {
      setMessage(`Chyba při načítání poruch: ${error.message}`);
      setLoading(false);
      return;
    }

    setCurrentProfile(currentProfileData as Profile);
    setFaults((faultsResult.data ?? []) as Fault[]);
    setFaultAssignees((assigneesResult.data ?? []) as FaultAssignee[]);
    setFaultNotes((notesResult.data ?? []) as FaultNote[]);
    setElevators((elevatorsResult.data ?? []) as Elevator[]);
    setRegions((regionsResult.data ?? []) as Region[]);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setProfileRegions((profileRegionsResult.data ?? []) as ProfileRegion[]);

    setLoading(false);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingFaultId(null);
    setElevatorQuery("");
    setShowForm(false);
  }

  function startCreate(priority?: FaultPriority) {
    setMessage("");
    setSuccessMessage("");
    setEditingFaultId(null);
    setElevatorQuery("");

    setForm({
      ...emptyForm,
      priority: priority ?? "bezna",
    });

    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function startEdit(fault: Fault) {
    setMessage("");
    setSuccessMessage("");

    const helpers = faultAssignees
      .filter(
        (item) => item.fault_id === fault.id && item.role === "spolupracovnik"
      )
      .map((item) => item.profile_id);

    setEditingFaultId(fault.id);
    setForm({
      elevator_id: fault.elevator_id,
      priority: fault.priority,
      description: fault.description,
      main_technician_id: fault.main_technician_id ?? "",
      helper_ids: helpers,
      note: "",
    });
    setElevatorQuery(getElevatorLabel(fault.elevator_id));
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function updateForm<K extends keyof FaultForm>(key: K, value: FaultForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectElevator(elevator: Elevator) {
    updateForm("elevator_id", elevator.id);
    setElevatorQuery(`${elevator.address} — ${elevator.label}`);
  }

  function toggleHelper(technicianId: string) {
    setForm((current) => {
      const helperIds = current.helper_ids.includes(technicianId)
        ? current.helper_ids.filter((id) => id !== technicianId)
        : [...current.helper_ids, technicianId];

      return {
        ...current,
        helper_ids: helperIds.filter((id) => id !== current.main_technician_id),
      };
    });
  }

  async function notifyFaultCreated(faultId: string) {
    try {
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.warn("Push upozornění se neposlalo: chybí session token.");
        return;
      }

      const pushResponse = await fetch("/api/push/fault-created", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fault_id: faultId,
        }),
      });

      if (!pushResponse.ok) {
        const pushText = await pushResponse.text();
        console.warn("Push upozornění se nepovedlo odeslat:", pushText);
      }
    } catch (pushError) {
      console.warn("Push upozornění se nepovedlo odeslat:", pushError);
    }
  }

  async function saveFault(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.elevator_id) {
      setMessage("Vyber výtah z našeptávače.");
      setSuccessMessage("");
      return;
    }

    const selectedElevator = elevators.find(
      (item) => item.id === form.elevator_id
    );

    if (!selectedElevator) {
      setMessage("Vybraný výtah nebyl nalezen.");
      setSuccessMessage("");
      return;
    }

    const description =
      form.priority === "uvizle_osoby"
        ? form.description.trim() ||
          "Uvízlé osoby – rychlé založení bez popisu."
        : form.description.trim();

    if (form.priority !== "uvizle_osoby" && !description) {
      setMessage("U běžné poruchy vyplň popis.");
      setSuccessMessage("");
      return;
    }

    if (!currentProfile) {
      setMessage("Nejsi přihlášený.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage(editingFaultId ? "Ukládám změny..." : "Ukládám poruchu...");

    const supabase = createClient();

    const status: FaultStatus = form.main_technician_id ? "prirazeno" : "nova";

    if (editingFaultId) {
      const { error: updateError } = await supabase
        .from("faults")
        .update({
          elevator_id: selectedElevator.id,
          region_id: selectedElevator.region_id,
          priority: form.priority,
          description,
          main_technician_id: form.main_technician_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFaultId);

      if (updateError) {
        setSaving(false);
        setSuccessMessage("");
        setMessage(`Chyba při úpravě poruchy: ${updateError.message}`);
        return;
      }

      const { error: deleteAssigneesError } = await supabase
        .from("fault_assignees")
        .delete()
        .eq("fault_id", editingFaultId);

      if (deleteAssigneesError) {
        setSaving(false);
        setSuccessMessage("");
        setMessage(
          `Porucha byla upravena, ale nepovedlo se obnovit přiřazení: ${deleteAssigneesError.message}`
        );
        await loadData();
        return;
      }

      const assigneeRows = [
        ...(form.main_technician_id
          ? [
              {
                fault_id: editingFaultId,
                profile_id: form.main_technician_id,
                role: "hlavni" as const,
              },
            ]
          : []),
        ...form.helper_ids
          .filter((id) => id !== form.main_technician_id)
          .map((id) => ({
            fault_id: editingFaultId,
            profile_id: id,
            role: "spolupracovnik" as const,
          })),
      ];

      if (assigneeRows.length > 0) {
        const { error: insertAssigneesError } = await supabase
          .from("fault_assignees")
          .insert(assigneeRows);

        if (insertAssigneesError) {
          setSaving(false);
          setSuccessMessage("");
          setMessage(
            `Porucha byla upravena, ale nepovedlo se uložit přiřazení: ${insertAssigneesError.message}`
          );
          await loadData();
          return;
        }
      }

      const noteText = form.note.trim();

      if (noteText) {
        const { error: noteError } = await supabase.from("fault_notes").insert({
          fault_id: editingFaultId,
          profile_id: currentProfile.id,
          note: noteText,
        });

        if (noteError) {
          setSaving(false);
          setSuccessMessage("");
          setMessage(
            `Porucha byla upravena, ale nepovedlo se uložit poznámku: ${noteError.message}`
          );
          await loadData();
          return;
        }
      }

      setSaving(false);
      resetForm();
      setSuccessMessage("Porucha byla upravena.");
      await loadData();
      return;
    }

    const { data: insertedFault, error: insertError } = await supabase
      .from("faults")
      .insert({
        elevator_id: selectedElevator.id,
        region_id: selectedElevator.region_id,
        priority: form.priority,
        status,
        description,
        created_by: currentProfile.id,
        main_technician_id: form.main_technician_id || null,
      })
      .select("id")
      .single();

    if (insertError || !insertedFault) {
      setSaving(false);
      setSuccessMessage("");
      setMessage(
        `Chyba při založení poruchy: ${
          insertError?.message ?? "Neznámá chyba"
        }`
      );
      return;
    }

    const assigneeRows = [
      ...(form.main_technician_id
        ? [
            {
              fault_id: insertedFault.id,
              profile_id: form.main_technician_id,
              role: "hlavni" as const,
            },
          ]
        : []),
      ...form.helper_ids
        .filter((id) => id !== form.main_technician_id)
        .map((id) => ({
          fault_id: insertedFault.id,
          profile_id: id,
          role: "spolupracovnik" as const,
        })),
    ];

    if (assigneeRows.length > 0) {
      const { error: assigneesError } = await supabase
        .from("fault_assignees")
        .insert(assigneeRows);

      if (assigneesError) {
        setSaving(false);
        setSuccessMessage("");
        setMessage(
          `Porucha vznikla, ale nepovedlo se uložit přiřazení: ${assigneesError.message}`
        );
        await loadData();
        return;
      }
    }

    const noteText = form.note.trim();

    if (noteText) {
      const { error: noteError } = await supabase.from("fault_notes").insert({
        fault_id: insertedFault.id,
        profile_id: currentProfile.id,
        note: noteText,
      });

      if (noteError) {
        setSaving(false);
        setSuccessMessage("");
        setMessage(
          `Porucha vznikla, ale nepovedlo se uložit poznámku: ${noteError.message}`
        );
        await loadData();
        return;
      }
    }

    await notifyFaultCreated(insertedFault.id);

    setSaving(false);
    resetForm();
    setSuccessMessage("Porucha byla založena. Upozornění bylo odesláno.");
    await loadData();
  }

  async function updateFaultStatus(fault: Fault, status: FaultStatus) {
    const confirmText =
      status === "hotovo"
        ? "Opravdu označit poruchu jako hotovou?"
        : status === "archivovano"
          ? "Opravdu archivovat poruchu?"
          : null;

    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setMessage("");
    setSuccessMessage("Ukládám změnu stavu...");

    const supabase = createClient();

    const payload: {
      status: FaultStatus;
      updated_at: string;
      finished_at?: string | null;
      archived_at?: string | null;
    } = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "hotovo") {
      payload.finished_at = new Date().toISOString();
    }

    if (status === "archivovano") {
      payload.archived_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("faults")
      .update(payload)
      .eq("id", fault.id);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při změně stavu: ${error.message}`);
      return;
    }

    setSuccessMessage("Stav poruchy byl změněn.");
    await loadData();
  }

  async function deleteFault(fault: Fault) {
    if (!isAdminOrLead) {
      setMessage("Mazat poruchy může jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu smazat poruchu?\n\n${getElevatorLabel(
        fault.elevator_id
      )}\n\nTahle akce smaže i přiřazené techniky a poznámky.`
    );

    if (!confirmed) return;

    setMessage("");
    setSuccessMessage("Mažu poruchu...");

    const supabase = createClient();

    const { error } = await supabase.from("faults").delete().eq("id", fault.id);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při mazání poruchy: ${error.message}`);
      return;
    }

    if (editingFaultId === fault.id) {
      resetForm();
    }

    setSuccessMessage("Porucha byla smazána.");
    await loadData();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="page-shell">
        <p>Načítám poruchy...</p>
        <StyleBlock />
      </main>
    );
  }

  return (
    <main className="app-layout">
      <StyleBlock />

      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-kicker">SERVISNÍ SYSTÉM</div>
          <div className="brand-title">Výtahy Servis</div>
          <div className="brand-subtitle">Poruchy a urgentní výjezdy</div>
        </div>

        <div className="side-label">PŘIHLÁŠENÝ UŽIVATEL</div>

        <div className="user-select">
          {currentProfile ? currentProfile.full_name : "Nepřihlášen"} —{" "}
          {currentProfile ? roleLabels[currentProfile.role] : ""}
        </div>

        <nav className="nav">
          <NavLink href="/dashboard" label="Hlavní stránka" />
          <NavLink active href="/faults" label="Poruchy" />
          <NavLink href="/messages" label="Zprávy" />
          <NavLink href="/service" label="Servis" />
          <NavLink href="/elevators" label="Výtahy" />
          <NavLink href="/technicians" label="Technici" />
          <NavLink href="/inspections" label="Revize" />
          <NavLink href="/regions" label="Rajony" />
        </nav>

        {currentProfile && (
          <div className="profile-card">
            <strong>{currentProfile.full_name}</strong>
            <span>{roleLabels[currentProfile.role]}</span>
            <span>
              Rajon:{" "}
              {currentProfile.primary_region_id
                ? getRegionName(currentProfile.primary_region_id)
                : "Bez rajonu"}
            </span>
          </div>
        )}

        <div className="sidebar-spacer" />

        <button
          onClick={handleLogout}
          className="logout-button desktop-logout-button"
        >
          Odhlásit
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Poruchy</h1>
            <p>Aktivní poruchy, uvízlé osoby, přiřazení techniků a archiv.</p>
          </div>

          <div className="topbar-actions">
            <button onClick={() => startCreate()} className="primary-action">
              + Založit poruchu
            </button>

            <button
              onClick={() => startCreate("uvizle_osoby")}
              className="danger-action"
            >
              Uvízlé osoby
            </button>
          </div>
        </header>

        {message && <div className="error-box">{message}</div>}
        {successMessage && <div className="success-box">{successMessage}</div>}

        <section className="stats-grid">
          <StatCard label="Aktivní poruchy" value={activeFaultsCount} />
          <StatCard label="Uvízlé osoby" value={trappedFaultsCount} danger />
          <StatCard label="Moje poruchy" value={myFaultsCount} />
          <StatCard label="Zobrazeno" value={orderedFaults.length} />
        </section>

        {showForm && (
          <section className="card form-card">
            <div className="card-header">
              <h2>
                {editingFaultId
                  ? "Upravit poruchu"
                  : form.priority === "uvizle_osoby"
                    ? "Rychlé založení – uvízlé osoby"
                    : "Založit poruchu"}
              </h2>
              <p>
                U uvízlých osob není povinný popis. Při úpravě můžeš doplnit
                poznámku do časové osy.
              </p>
            </div>

            <form onSubmit={saveFault} className="fault-form">
              <label className="field">
                <span>Výtah</span>

                <div className="suggest-wrap">
                  <input
                    value={elevatorQuery}
                    onChange={(event) => {
                      setElevatorQuery(event.target.value);
                      updateForm("elevator_id", "");
                    }}
                    placeholder="Piš adresu, označení, PR, PL nebo výrobní číslo..."
                    className="input"
                  />

                  {elevatorQuery && !form.elevator_id && (
                    <div className="suggestions">
                      {elevatorSuggestions.length === 0 ? (
                        <div className="suggest-empty">Žádný výtah nenalezen.</div>
                      ) : (
                        elevatorSuggestions.map((elevator) => (
                          <button
                            key={elevator.id}
                            type="button"
                            onClick={() => selectElevator(elevator)}
                            className="suggest-item"
                          >
                            <strong>{elevator.address}</strong>
                            <span>{elevator.label}</span>
                            <small>
                              Rajon: {getRegionName(elevator.region_id)} · PR:{" "}
                              {elevator.pr_number || "—"} · PL:{" "}
                              {elevator.pl_number || "—"} · Výr. č.:{" "}
                              {elevator.serial_number || "—"}
                            </small>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {form.elevator_id && (
                    <div className="selected-elevator">
                      <span>Vybráno: {getElevatorLabel(form.elevator_id)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          updateForm("elevator_id", "");
                          setElevatorQuery("");
                        }}
                      >
                        Změnit
                      </button>
                    </div>
                  )}
                </div>
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Priorita</span>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      updateForm(
                        "priority",
                        event.target.value as FaultPriority
                      )
                    }
                    className="input"
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Hlavní technik</span>
                  <select
                    value={form.main_technician_id}
                    onChange={(event) => {
                      const mainId = event.target.value;

                      setForm((current) => ({
                        ...current,
                        main_technician_id: mainId,
                        helper_ids: current.helper_ids.filter(
                          (id) => id !== mainId
                        ),
                      }));
                    }}
                    className="input"
                  >
                    <option value="">Nepřiřazen</option>
                    {sortedTechniciansForSelectedElevator.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>
                  {form.priority === "uvizle_osoby"
                    ? "Popis – volitelný u uvízlých osob"
                    : "Popis poruchy"}
                </span>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  placeholder={
                    form.priority === "uvizle_osoby"
                      ? "Může zůstat prázdné"
                      : "Co se děje?"
                  }
                  className="textarea"
                />
              </label>

              <div className="helpers-box">
                <span>Spolupracující technici</span>

                <div className="helpers-list">
                  {sortedTechniciansForSelectedElevator.map((technician) => {
                    const isMain = form.main_technician_id === technician.id;

                    return (
                      <label
                        key={technician.id}
                        className={isMain ? "check-row muted" : "check-row"}
                      >
                        <input
                          type="checkbox"
                          disabled={isMain}
                          checked={form.helper_ids.includes(technician.id)}
                          onChange={() => toggleHelper(technician.id)}
                        />
                        {technician.full_name}
                        {isMain ? " — hlavní technik" : ""}
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="field">
                <span>
                  {editingFaultId
                    ? "Poznámka do časové osy při úpravě – volitelná"
                    : "Poznámka do časové osy – volitelná"}
                </span>
                <textarea
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  placeholder="Volitelná poznámka"
                  className="textarea small"
                />
              </label>

              <div className="form-actions">
                <button disabled={saving} type="submit" className="primary-action">
                  {saving
                    ? "Ukládám..."
                    : editingFaultId
                      ? "Uložit změny"
                      : "Uložit poruchu"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="secondary-action"
                >
                  Zrušit
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="card filter-card">
          <div className="filters">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat výtah, adresu, PR, PL, technika..."
              className="input"
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "active" | "done" | "archive" | "all"
                )
              }
              className="input"
            >
              <option value="active">Aktivní</option>
              <option value="done">Hotové</option>
              <option value="archive">Archivované</option>
              <option value="all">Všechny</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as FaultPriority | "all")
              }
              className="input"
            >
              <option value="all">Všechny priority</option>
              <option value="uvizle_osoby">Uvízlé osoby</option>
              <option value="odstavka">Odstávka</option>
              <option value="dulezita">Důležitá</option>
              <option value="bezna">Běžná</option>
            </select>

            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="input"
            >
              <option value="">Všechny rajony</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>

            <select
              value={technicianFilter}
              onChange={(event) => setTechnicianFilter(event.target.value)}
              className="input"
            >
              <option value="">Všichni technici</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="fault-list">
          {orderedFaults.length === 0 && (
            <div className="empty-box">Žádné poruchy pro vybraný filtr.</div>
          )}

          {orderedFaults.map((fault) => (
            <FaultCard key={fault.id} fault={fault} />
          ))}
        </section>

        <button
          onClick={handleLogout}
          className="logout-button mobile-logout-button"
        >
          Odhlásit
        </button>
      </section>
    </main>
  );

  function FaultCard({ fault }: { fault: Fault }) {
    const helpers = getHelpersForFault(fault.id);
    const notes = getNotesForFault(fault.id);
    const urgent = fault.priority === "uvizle_osoby";

    return (
      <article className={urgent ? "fault-card urgent" : "fault-card"}>
        <div className="fault-main">
          <div>
            <div className="fault-tags">
              <span className={urgent ? "pill red" : "pill amber"}>
                {priorityLabels[fault.priority]}
              </span>

              <span className="pill blue">{statusLabels[fault.status]}</span>

              {isFaultAssignedToMe(fault) && (
                <span className="pill green">Moje práce</span>
              )}
            </div>

            <h2>{getElevatorLabel(fault.elevator_id)}</h2>

            <p>{fault.description}</p>

            <div className="meta-text">
              Rajon: {getRegionName(fault.region_id)} · Vytvořeno:{" "}
              {new Date(fault.created_at).toLocaleString("cs-CZ")}
            </div>
          </div>

          <div className="fault-side">
            <div>
              <strong>Hlavní technik</strong>
              <span>{getProfileName(fault.main_technician_id)}</span>
            </div>

            <div>
              <strong>Spolupracovníci</strong>
              <span>{helpers.length > 0 ? helpers.join(", ") : "Žádní"}</span>
            </div>
          </div>
        </div>

        {notes.length > 0 && (
          <div className="timeline">
            <strong>Časová osa</strong>

            {notes.map((note) => (
              <div key={note.id} className="timeline-item">
                <span>
                  {new Date(note.created_at).toLocaleString("cs-CZ")} ·{" "}
                  {getProfileName(note.profile_id)}
                </span>
                <p>{note.note}</p>
              </div>
            ))}
          </div>
        )}

        <div className="fault-actions">
          <button onClick={() => startEdit(fault)} className="secondary-action">
            Upravit
          </button>

          {fault.status !== "hotovo" && fault.status !== "archivovano" && (
            <>
              <button
                onClick={() => updateFaultStatus(fault, "na_ceste")}
                className="secondary-action"
              >
                Na cestě
              </button>

              <button
                onClick={() => updateFaultStatus(fault, "rozpracovano")}
                className="secondary-action"
              >
                Rozpracováno
              </button>

              <button
                onClick={() => updateFaultStatus(fault, "hotovo")}
                className="success-action"
              >
                Hotovo
              </button>
            </>
          )}

          {fault.status === "hotovo" && (
            <button
              onClick={() => updateFaultStatus(fault, "archivovano")}
              className="secondary-action"
            >
              Archivovat
            </button>
          )}

          {isAdminOrLead && (
            <button onClick={() => deleteFault(fault)} className="delete-action">
              Smazat
            </button>
          )}
        </div>
      </article>
    );
  }
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a className={active ? "nav-link active" : "nav-link"} href={href}>
      {label}
    </a>
  );
}

function StatCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={danger ? "stat-card danger" : "stat-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
        background: #020617;
      }

      .page-shell {
        min-height: 100vh;
        background: #020617;
        color: white;
        padding: 40px;
      }

      .app-layout {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 280px 1fr;
        background: #020617;
        color: #f8fafc;
      }

      .sidebar {
        background: #020617;
        border-right: 1px solid #1e293b;
        padding: 14px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .brand-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 18px;
        padding: 18px;
        margin-bottom: 18px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
      }

      .brand-kicker {
        color: #94a3b8;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.05em;
      }

      .brand-title {
        font-size: 23px;
        font-weight: 950;
        margin-top: 4px;
      }

      .brand-subtitle {
        color: #94a3b8;
        font-size: 13px;
        margin-top: 12px;
      }

      .side-label {
        color: #64748b;
        font-size: 12px;
        font-weight: 900;
        margin: 14px 0 8px;
      }

      .user-select {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 12px;
        color: #e2e8f0;
        margin-bottom: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nav {
        display: grid;
        gap: 8px;
      }

      .nav-link {
        display: block;
        padding: 13px 14px;
        border-radius: 13px;
        color: #cbd5e1;
        background: #0f172a;
        border: 1px solid #1e293b;
        text-decoration: none;
        font-weight: 800;
      }

      .nav-link:hover {
        border-color: #3b82f6;
      }

      .nav-link.active {
        background: #2563eb;
        color: white;
        border-color: #60a5fa;
      }

      .profile-card {
        margin-top: 16px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
        display: grid;
        gap: 5px;
        color: #94a3b8;
        font-size: 13px;
      }

      .profile-card strong {
        color: white;
        font-size: 15px;
      }

      .sidebar-spacer {
        flex: 1;
        min-height: 14px;
      }

      .logout-button {
        width: 100%;
        border: 0;
        background: #7f1d1d;
        color: #fecaca;
        border-radius: 13px;
        padding: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .mobile-logout-button {
        display: none;
      }

      .content {
        padding: 34px;
        background: linear-gradient(180deg, #020617 0%, #0f172a 100%);
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
        flex-wrap: wrap;
        margin-bottom: 22px;
      }

      .topbar h1 {
        margin: 0 0 6px;
        font-size: 34px;
        font-weight: 950;
        letter-spacing: -0.04em;
      }

      .topbar p {
        margin: 0;
        color: #94a3b8;
      }

      .topbar-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .primary-action,
      .danger-action,
      .secondary-action,
      .success-action,
      .delete-action {
        border: 0;
        border-radius: 14px;
        padding: 12px 16px;
        font-weight: 900;
        cursor: pointer;
        color: white;
        text-decoration: none;
      }

      .primary-action {
        background: #2563eb;
      }

      .danger-action {
        background: #dc2626;
      }

      .secondary-action {
        background: #334155;
      }

      .success-action {
        background: #16a34a;
      }

      .delete-action {
        background: #7f1d1d;
        color: #fecaca;
      }

      .error-box {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
        padding: 12px;
        border-radius: 12px;
        margin-bottom: 16px;
      }

      .success-box {
        background: #052e16;
        border: 1px solid #166534;
        color: #bbf7d0;
        padding: 12px;
        border-radius: 12px;
        margin-bottom: 16px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }

      .stat-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 20px;
        padding: 18px;
      }

      .stat-card.danger {
        border-color: #ef4444;
        background: #450a0a;
      }

      .stat-card span {
        display: block;
        color: #94a3b8;
        font-size: 14px;
        margin-bottom: 8px;
      }

      .stat-card strong {
        display: block;
        font-size: 34px;
        font-weight: 950;
      }

      .card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 24px;
        padding: 20px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
        margin-bottom: 18px;
      }

      .card-header {
        margin-bottom: 14px;
      }

      .card-header h2 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 950;
      }

      .card-header p {
        margin: 0;
        color: #94a3b8;
      }

      .fault-form {
        display: grid;
        gap: 14px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 14px;
      }

      .field {
        display: grid;
        gap: 6px;
      }

      .field span,
      .helpers-box > span {
        color: #cbd5e1;
        font-weight: 800;
      }

      .input,
      .textarea {
        width: 100%;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid #334155;
        background: #020617;
        color: white;
      }

      .textarea {
        min-height: 95px;
        resize: vertical;
      }

      .textarea.small {
        min-height: 70px;
      }

      .suggest-wrap {
        position: relative;
      }

      .suggestions {
        margin-top: 8px;
        display: grid;
        gap: 8px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 8px;
        max-height: 280px;
        overflow-y: auto;
      }

      .suggest-empty {
        color: #94a3b8;
        padding: 10px;
      }

      .suggest-item {
        text-align: left;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid #334155;
        background: #020617;
        color: white;
        cursor: pointer;
      }

      .suggest-item span,
      .suggest-item small {
        display: block;
        color: #94a3b8;
        margin-top: 4px;
      }

      .selected-elevator {
        margin-top: 8px;
        background: #052e16;
        border: 1px solid #166534;
        color: #bbf7d0;
        border-radius: 12px;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      .selected-elevator button {
        border: 0;
        border-radius: 10px;
        padding: 8px 10px;
        background: #166534;
        color: white;
        cursor: pointer;
        font-weight: 800;
      }

      .helpers-box {
        display: grid;
        gap: 8px;
      }

      .helpers-list {
        display: grid;
        gap: 8px;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 12px;
      }

      .check-row {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #cbd5e1;
      }

      .check-row.muted {
        color: #64748b;
      }

      .form-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .filters {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) repeat(4, minmax(160px, 220px));
        gap: 10px;
      }

      .fault-list {
        display: grid;
        gap: 14px;
      }

      .fault-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 24px;
        padding: 18px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.16);
      }

      .fault-card.urgent {
        border-color: #ef4444;
        background: #450a0a;
      }

      .fault-main {
        display: grid;
        grid-template-columns: 1fr minmax(240px, 320px);
        gap: 18px;
      }

      .fault-card h2 {
        margin: 0 0 8px;
        font-size: 21px;
        font-weight: 950;
      }

      .fault-card p {
        margin: 0;
        color: #cbd5e1;
        line-height: 1.5;
      }

      .fault-tags {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 900;
      }

      .pill.red {
        background: #7f1d1d;
        color: #fecaca;
        border: 1px solid #ef4444;
      }

      .pill.amber {
        background: #451a03;
        color: #fed7aa;
        border: 1px solid #f97316;
      }

      .pill.blue {
        background: #172554;
        color: #bfdbfe;
        border: 1px solid #3b82f6;
      }

      .pill.green {
        background: #052e16;
        color: #bbf7d0;
        border: 1px solid #16a34a;
      }

      .meta-text {
        color: #94a3b8;
        font-size: 13px;
        margin-top: 10px;
      }

      .fault-side {
        display: grid;
        gap: 10px;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
      }

      .fault-side div {
        display: grid;
        gap: 4px;
      }

      .fault-side strong {
        color: #94a3b8;
        font-size: 13px;
      }

      .fault-side span {
        color: #e2e8f0;
      }

      .timeline {
        margin-top: 14px;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
        display: grid;
        gap: 10px;
      }

      .timeline-item span {
        display: block;
        color: #94a3b8;
        font-size: 13px;
        margin-bottom: 4px;
      }

      .timeline-item p {
        color: #e2e8f0;
      }

      .fault-actions {
        margin-top: 14px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .empty-box {
        border: 1px dashed #334155;
        background: #020617;
        color: #94a3b8;
        border-radius: 16px;
        padding: 18px;
      }

      @media (max-width: 1100px) {
        .filters {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 980px) {
        .app-layout {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: relative;
          min-height: auto;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid #1e293b;
        }

        .sidebar-spacer {
          display: none;
        }

        .desktop-logout-button {
          display: none;
        }

        .mobile-logout-button {
          display: block;
          min-height: 48px;
          margin-top: 18px;
        }

        .content {
          padding: 18px;
        }

        .fault-main {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .page-shell {
          padding: 18px;
        }

        .sidebar {
          padding: 12px;
        }

        .brand-card {
          padding: 14px;
          margin-bottom: 12px;
          border-radius: 16px;
        }

        .brand-title {
          font-size: 20px;
        }

        .brand-subtitle {
          margin-top: 8px;
        }

        .side-label {
          margin-top: 8px;
        }

        .user-select {
          white-space: normal;
          line-height: 1.4;
          padding: 11px;
          margin-bottom: 12px;
        }

        .nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .nav-link {
          min-height: 48px;
          padding: 12px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 14px;
        }

        .profile-card {
          margin-top: 12px;
        }

        .logout-button {
          min-height: 48px;
        }

        .content {
          padding: 14px;
        }

        .topbar {
          display: grid;
          gap: 14px;
          margin-bottom: 16px;
        }

        .topbar h1 {
          font-size: 30px;
          line-height: 1.05;
        }

        .topbar p {
          font-size: 15px;
          line-height: 1.45;
        }

        .topbar-actions {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
        }

        .primary-action,
        .danger-action,
        .secondary-action,
        .success-action,
        .delete-action {
          min-height: 48px;
          width: 100%;
        }

        .stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .stat-card {
          padding: 14px;
          border-radius: 17px;
        }

        .stat-card strong {
          font-size: 28px;
        }

        .card {
          padding: 16px;
          border-radius: 20px;
          margin-bottom: 14px;
        }

        .card-header h2 {
          font-size: 20px;
        }

        .card-header p {
          font-size: 13px;
          line-height: 1.45;
        }

        .form-grid,
        .filters {
          grid-template-columns: 1fr;
        }

        .input,
        .textarea {
          min-height: 48px;
          font-size: 16px;
        }

        .textarea {
          min-height: 110px;
        }

        .textarea.small {
          min-height: 86px;
        }

        .suggestions {
          max-height: 360px;
        }

        .suggest-item {
          padding: 14px;
        }

        .selected-elevator {
          display: grid;
          gap: 10px;
        }

        .selected-elevator button {
          min-height: 44px;
          width: 100%;
        }

        .helpers-list {
          gap: 10px;
        }

        .check-row {
          min-height: 38px;
          align-items: flex-start;
        }

        .form-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .fault-card {
          padding: 16px;
          border-radius: 20px;
        }

        .fault-card h2 {
          font-size: 19px;
          line-height: 1.25;
        }

        .fault-card p {
          font-size: 14px;
        }

        .fault-side {
          padding: 12px;
        }

        .fault-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .pill {
          font-size: 11px;
          padding: 5px 9px;
        }
      }

      @media (max-width: 430px) {
        .nav {
          grid-template-columns: 1fr;
        }

        .content {
          padding: 12px;
        }

        .topbar h1 {
          font-size: 28px;
        }

        .stats-grid {
          grid-template-columns: 1fr;
        }

        .card,
        .fault-card {
          padding: 14px;
        }
      }
    `}</style>
  );
}