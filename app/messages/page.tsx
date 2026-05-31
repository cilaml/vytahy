"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRole =
  | "admin"
  | "vedouci_technik"
  | "technik"
  | "sekretariat"
  | "servis";

type MessageTargetType = "all" | "role" | "profile" | "region";

type ReactionType = "palec" | "videl" | "hotovo" | "text";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  primary_region_id: string | null;
  active: boolean;
};

type Region = {
  id: string;
  name: string;
};

type ProfileRegion = {
  id: string;
  profile_id: string;
  region_id: string;
};

type Message = {
  id: string;
  created_by: string | null;
  title: string;
  body: string;
  target_type: MessageTargetType;
  target_role: UserRole | null;
  target_profile_id: string | null;
  target_region_id: string | null;
  created_at: string;
};

type MessageReaction = {
  id: string;
  message_id: string;
  profile_id: string;
  reaction_type: ReactionType;
  text: string | null;
  created_at: string;
};

type MessageForm = {
  title: string;
  body: string;
  target_type: MessageTargetType;
  target_role: UserRole;
  target_profile_ids: string[];
  target_region_id: string;
};

type MessageInsertRow = {
  created_by: string;
  title: string;
  body: string;
  target_type: MessageTargetType;
  target_role: UserRole | null;
  target_profile_id: string | null;
  target_region_id: string | null;
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  vedouci_technik: "Vedoucí technik",
  technik: "Technik",
  sekretariat: "Sekretariát",
  servis: "Servis",
};

const targetTypeLabels: Record<MessageTargetType, string> = {
  all: "Všem",
  role: "Roli",
  profile: "Vybraným technikům",
  region: "Rajonu",
};

const reactionLabels: Record<ReactionType, string> = {
  palec: "👍",
  videl: "👀",
  hotovo: "✅",
  text: "💬",
};

const emptyForm: MessageForm = {
  title: "",
  body: "",
  target_type: "all",
  target_role: "technik",
  target_profile_ids: [],
  target_region_id: "",
};

const navigationItems = [
  { href: "/dashboard", label: "Hlavní stránka" },
  { href: "/faults", label: "Poruchy" },
  { href: "/messages", label: "Zprávy", active: true },
  { href: "/service", label: "Servis" },
  { href: "/elevators", label: "Výtahy" },
  { href: "/technicians", label: "Technici" },
  { href: "/inspections", label: "Revize" },
  { href: "/regions", label: "Rajony" },
];

export default function MessagesPage() {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [profileRegions, setProfileRegions] = useState<ProfileRegion[]>([]);

  const [form, setForm] = useState<MessageForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const [textReactionByMessageId, setTextReactionByMessageId] = useState<
    Record<string, string>
  >({});

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isAdminOrLead =
    currentProfile?.role === "admin" ||
    currentProfile?.role === "vedouci_technik";

  const activeProfiles = useMemo(() => {
    return profiles.filter((profile) => profile.active);
  }, [profiles]);

  const myVisibleCount = useMemo(() => {
    return messages.filter((item) => isMessageRelevant(item)).length;
  }, [messages, currentProfile, profileRegions, profiles, regions]);

  const myReactionCount = useMemo(() => {
    if (!currentProfile) return 0;

    return reactions.filter(
      (reaction) => reaction.profile_id === currentProfile.id
    ).length;
  }, [reactions, currentProfile]);

  function getProfileName(profileId: string | null) {
    if (!profileId) return "Neznámý uživatel";

    return (
      profiles.find((profile) => profile.id === profileId)?.full_name ??
      "Neznámý uživatel"
    );
  }

  function getRegionName(regionId: string | null) {
    if (!regionId) return "Neznámý rajon";

    return (
      regions.find((region) => region.id === regionId)?.name ??
      "Neznámý rajon"
    );
  }

  function getRoleLabel(role: UserRole | undefined) {
    if (!role) return "Uživatel";
    return roleLabels[role] ?? role;
  }

  function getTargetLabel(item: Message) {
    if (item.target_type === "all") return "Všem";

    if (item.target_type === "role") {
      return `Role: ${item.target_role ? roleLabels[item.target_role] : "—"}`;
    }

    if (item.target_type === "profile") {
      return `Technik: ${getProfileName(item.target_profile_id)}`;
    }

    return `Rajon: ${getRegionName(item.target_region_id)}`;
  }

  function isMessageRelevant(item: Message) {
    if (!currentProfile) return false;

    if (isAdminOrLead) return true;

    if (item.target_type === "all") return true;

    if (item.target_type === "role") {
      return item.target_role === currentProfile.role;
    }

    if (item.target_type === "profile") {
      return item.target_profile_id === currentProfile.id;
    }

    if (item.target_type === "region") {
      if (!item.target_region_id) return false;

      if (currentProfile.primary_region_id === item.target_region_id) {
        return true;
      }

      return profileRegions.some(
        (profileRegion) =>
          profileRegion.profile_id === currentProfile.id &&
          profileRegion.region_id === item.target_region_id
      );
    }

    return false;
  }

  const visibleMessages = useMemo(() => {
    const text = search.trim().toLowerCase();

    return messages
      .filter((item) => isMessageRelevant(item))
      .filter((item) => {
        if (!text) return true;

        return [
          item.title,
          item.body,
          getProfileName(item.created_by),
          getTargetLabel(item),
        ]
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [messages, currentProfile, profileRegions, search, profiles, regions]);

  function getReactionsForMessage(messageId: string) {
    return reactions
      .filter((reaction) => reaction.message_id === messageId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  function hasMyReaction(messageId: string, reactionType: ReactionType) {
    if (!currentProfile) return false;

    return reactions.some(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.profile_id === currentProfile.id &&
        reaction.reaction_type === reactionType
    );
  }

  function updateForm<K extends keyof MessageForm>(
    key: K,
    value: MessageForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleTargetProfile(profileId: string) {
    setForm((current) => {
      if (current.target_profile_ids.includes(profileId)) {
        return {
          ...current,
          target_profile_ids: current.target_profile_ids.filter(
            (id) => id !== profileId
          ),
        };
      }

      return {
        ...current,
        target_profile_ids: [...current.target_profile_ids, profileId],
      };
    });
  }

  function selectAllProfiles() {
    setForm((current) => ({
      ...current,
      target_profile_ids: activeProfiles.map((profile) => profile.id),
    }));
  }

  function clearSelectedProfiles() {
    setForm((current) => ({
      ...current,
      target_profile_ids: [],
    }));
  }

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
        .select("id, email, full_name, role, primary_region_id, active")
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
      messagesResult,
      reactionsResult,
      profilesResult,
      regionsResult,
      profileRegionsResult,
    ] = await Promise.all([
      supabase
        .from("messages")
        .select(
          "id, created_by, title, body, target_type, target_role, target_profile_id, target_region_id, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("message_reactions")
        .select("id, message_id, profile_id, reaction_type, text, created_at")
        .order("created_at", { ascending: true }),

      supabase
        .from("profiles")
        .select("id, email, full_name, role, primary_region_id, active")
        .eq("active", true)
        .order("full_name", { ascending: true }),

      supabase
        .from("regions")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase.from("profile_regions").select("id, profile_id, region_id"),
    ]);

    const error =
      messagesResult.error ||
      reactionsResult.error ||
      profilesResult.error ||
      regionsResult.error ||
      profileRegionsResult.error;

    if (error) {
      setMessage(`Chyba při načítání zpráv: ${error.message}`);
      setLoading(false);
      return;
    }

    setCurrentProfile(currentProfileData as Profile);
    setMessages((messagesResult.data ?? []) as Message[]);
    setReactions((reactionsResult.data ?? []) as MessageReaction[]);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    setRegions((regionsResult.data ?? []) as Region[]);
    setProfileRegions((profileRegionsResult.data ?? []) as ProfileRegion[]);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function startCreateMessage() {
    setMessage("");
    setSuccessMessage("");
    setForm(emptyForm);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentProfile) {
      setMessage("Nejsi přihlášený.");
      setSuccessMessage("");
      return;
    }

    if (!isAdminOrLead) {
      setMessage("Zprávy může vytvářet jen admin nebo vedoucí technik.");
      setSuccessMessage("");
      return;
    }

    const title = form.title.trim();
    const body = form.body.trim();

    if (!title) {
      setMessage("Vyplň nadpis zprávy.");
      setSuccessMessage("");
      return;
    }

    if (!body) {
      setMessage("Vyplň text zprávy.");
      setSuccessMessage("");
      return;
    }

    if (form.target_type === "profile" && form.target_profile_ids.length === 0) {
      setMessage("Vyber alespoň jednoho technika.");
      setSuccessMessage("");
      return;
    }

    if (form.target_type === "region" && !form.target_region_id) {
      setMessage("Vyber rajon.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMessage("Ukládám zprávu...");

    const supabase = createClient();

    const rowsToInsert: MessageInsertRow[] =
      form.target_type === "profile"
        ? form.target_profile_ids.map((profileId) => ({
            created_by: currentProfile.id,
            title,
            body,
            target_type: "profile",
            target_role: null,
            target_profile_id: profileId,
            target_region_id: null,
          }))
        : [
            {
              created_by: currentProfile.id,
              title,
              body,
              target_type: form.target_type,
              target_role: form.target_type === "role" ? form.target_role : null,
              target_profile_id: null,
              target_region_id:
                form.target_type === "region" ? form.target_region_id : null,
            },
          ];

    const { error } = await supabase
      .from("messages")
      .insert(rowsToInsert as unknown as Record<string, unknown>[]);

    setSaving(false);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při ukládání zprávy: ${error.message}`);
      return;
    }

    setShowForm(false);
    setForm(emptyForm);

    setSuccessMessage(
      form.target_type === "profile"
        ? `Zpráva byla odeslána ${rowsToInsert.length} vybraným technikům.`
        : "Zpráva byla uložena."
    );

    await loadData();
  }

  async function deleteMessage(item: Message) {
    if (!isAdminOrLead) return;

    const confirmed = window.confirm(`Opravdu smazat zprávu „${item.title}“?`);

    if (!confirmed) return;

    setDeletingMessageId(item.id);
    setMessage("");
    setSuccessMessage("Mažu zprávu...");

    const supabase = createClient();

    const { error } = await supabase.from("messages").delete().eq("id", item.id);

    setDeletingMessageId(null);

    if (error) {
      setSuccessMessage("");
      setMessage(`Chyba při mazání zprávy: ${error.message}`);
      return;
    }

    setSuccessMessage("Zpráva byla smazána.");
    await loadData();
  }

  async function addReaction(messageId: string, reactionType: ReactionType) {
    if (!currentProfile) {
      setMessage("Nejsi přihlášený.");
      setSuccessMessage("");
      return;
    }

    const existing = reactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.profile_id === currentProfile.id &&
        reaction.reaction_type === reactionType
    );

    const supabase = createClient();

    if (existing) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);

      if (error) {
        setMessage(`Chyba při odebrání reakce: ${error.message}`);
        setSuccessMessage("");
        return;
      }

      await loadData();
      return;
    }

    const text =
      reactionType === "text"
        ? (textReactionByMessageId[messageId] ?? "").trim()
        : null;

    if (reactionType === "text" && !text) {
      setMessage("Napiš textovou reakci.");
      setSuccessMessage("");
      return;
    }

    const { error } = await supabase.from("message_reactions").insert({
      message_id: messageId,
      profile_id: currentProfile.id,
      reaction_type: reactionType,
      text,
    });

    if (error) {
      setMessage(`Chyba při uložení reakce: ${error.message}`);
      setSuccessMessage("");
      return;
    }

    if (reactionType === "text") {
      setTextReactionByMessageId((current) => ({
        ...current,
        [messageId]: "",
      }));
    }

    setMessage("");
    await loadData();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="app-layout">
        <StyleBlock />

        <aside className="sidebar">
          <div className="brand-card">
            <div className="brand-kicker">SERVISNÍ SYSTÉM</div>
            <div className="brand-title">Výtahy Servis</div>
            <div className="brand-subtitle">
              Databáze, poruchy, servis a revize
            </div>
          </div>
        </aside>

        <section className="content">
          <div className="empty-box">Načítám zprávy...</div>
        </section>
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
          <div className="brand-subtitle">
            Databáze, poruchy, servis a revize
          </div>
        </div>

        <div className="side-label">PŘIHLÁŠENÝ UŽIVATEL</div>

        <div className="user-select">
          {(currentProfile?.full_name || currentProfile?.email || "Uživatel") +
            " — " +
            getRoleLabel(currentProfile?.role)}
        </div>

        <nav className="nav">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? "nav-link active" : "nav-link"}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="profile-card">
          <strong>{currentProfile?.full_name || "Uživatel"}</strong>
          <span>Role: {getRoleLabel(currentProfile?.role)}</span>
          <span>Viditelné zprávy: {myVisibleCount}</span>
          <span>Moje reakce: {myReactionCount}</span>
        </div>

        <div className="sidebar-spacer" />

        <button
          onClick={signOut}
          className="logout-button desktop-logout-button"
        >
          Odhlásit
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Zprávy</h1>
            <p>
              Interní zprávy pro všechny, role, vybrané techniky nebo rajony.
            </p>
          </div>

          {isAdminOrLead && (
            <button onClick={startCreateMessage} className="primary-button">
              + Nová zpráva
            </button>
          )}
        </header>

        {message && <div className="error-box">{message}</div>}
        {successMessage && <div className="success-box">{successMessage}</div>}

        <section className="top-grid">
          <section className="card">
            <div className="card-header">
              <h2>Přehled zpráv</h2>
              <p>Relevantní zprávy podle role, rajonu nebo přímého přiřazení.</p>
            </div>

            <div className="stat-grid">
              <MiniStat
                label="Viditelné"
                value={String(visibleMessages.length)}
                description="zpráv pro tebe"
              />
              <MiniStat
                label="Celkem"
                value={String(messages.length)}
                description="v databázi"
              />
              <MiniStat
                label="Reakce"
                value={String(reactions.length)}
                description="všechny reakce"
              />
              <MiniStat
                label="Moje reakce"
                value={String(myReactionCount)}
                description="od tebe"
                tone="green"
              />
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Odesílání</h2>
              <p>Zprávy vytváří admin nebo vedoucí technik.</p>
            </div>

            <div className="empty-box">
              {isAdminOrLead
                ? "Můžeš vytvářet a mazat interní zprávy."
                : "Zprávy můžeš číst a reagovat na ně."}
            </div>
          </section>
        </section>

        {showForm && (
          <form onSubmit={saveMessage} className="card message-form-card">
            <div className="form-top">
              <div>
                <h2>Nová zpráva</h2>
                <p>Vyber příjemce, napiš nadpis a text zprávy.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setMessage("");
                  setSuccessMessage("");
                }}
                className="secondary-button"
              >
                Zavřít
              </button>
            </div>

            <div className="form-grid">
              <Field label="Nadpis">
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Např. Důležité upozornění"
                  className="input"
                />
              </Field>

              <Field label="Komu">
                <select
                  value={form.target_type}
                  onChange={(event) =>
                    updateForm(
                      "target_type",
                      event.target.value as MessageTargetType
                    )
                  }
                  className="input"
                >
                  {Object.entries(targetTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              {form.target_type === "role" && (
                <Field label="Role">
                  <select
                    value={form.target_role}
                    onChange={(event) =>
                      updateForm("target_role", event.target.value as UserRole)
                    }
                    className="input"
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.target_type === "region" && (
                <Field label="Rajon">
                  <select
                    value={form.target_region_id}
                    onChange={(event) =>
                      updateForm("target_region_id", event.target.value)
                    }
                    className="input"
                  >
                    <option value="">Vyber rajon</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Text zprávy">
              <textarea
                value={form.body}
                onChange={(event) => updateForm("body", event.target.value)}
                placeholder="Text zprávy..."
                className="textarea"
              />
            </Field>

            {form.target_type === "profile" && (
              <div>
                <div className="multi-header">
                  <div>
                    <h3>Vybraní technici: {form.target_profile_ids.length}</h3>
                    <p>
                      Každému vybranému technikovi se vytvoří vlastní zpráva.
                    </p>
                  </div>

                  <div className="small-actions">
                    <button
                      type="button"
                      onClick={selectAllProfiles}
                      className="small-secondary-button"
                    >
                      Vybrat všechny
                    </button>

                    <button
                      type="button"
                      onClick={clearSelectedProfiles}
                      className="small-secondary-button"
                    >
                      Zrušit výběr
                    </button>
                  </div>
                </div>

                <div className="profile-picker">
                  {activeProfiles.map((profile) => {
                    const checked = form.target_profile_ids.includes(profile.id);

                    return (
                      <label
                        key={profile.id}
                        className={
                          checked ? "profile-checkbox active" : "profile-checkbox"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTargetProfile(profile.id)}
                        />

                        <span>
                          <strong>{profile.full_name || profile.email}</strong>
                          <small>
                            {roleLabels[profile.role]} ·{" "}
                            {profile.email || "bez e-mailu"}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="actions">
              <button disabled={saving} type="submit" className="save-button">
                {saving ? "Ukládám..." : "Uložit zprávu"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setMessage("");
                  setSuccessMessage("");
                }}
                className="secondary-button"
              >
                Zrušit
              </button>
            </div>
          </form>
        )}

        <section className="card">
          <div className="card-header">
            <h2>Vyhledávání</h2>
            <p>Hledání podle nadpisu, textu, autora nebo cílení.</p>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hledat ve zprávách..."
            className="input"
          />
        </section>

        <section className="message-list">
          {visibleMessages.length === 0 && (
            <div className="empty-box">Žádné zprávy.</div>
          )}

          {visibleMessages.map((item) => {
            const itemReactions = getReactionsForMessage(item.id);
            const isDeleting = deletingMessageId === item.id;

            return (
              <article key={item.id} className="message-card">
                <div className="message-top">
                  <div>
                    <h2>{item.title}</h2>

                    <div className="message-meta">
                      Od: {getProfileName(item.created_by)} · Komu:{" "}
                      {getTargetLabel(item)} ·{" "}
                      {new Date(item.created_at).toLocaleString("cs-CZ")}
                    </div>
                  </div>

                  {isAdminOrLead && (
                    <button
                      onClick={() => deleteMessage(item)}
                      disabled={isDeleting}
                      className="delete-button"
                    >
                      {isDeleting ? "Mažu..." : "Smazat"}
                    </button>
                  )}
                </div>

                <p className="message-body">{item.body}</p>

                <div className="reaction-row">
                  <ReactionButton
                    label="👍"
                    active={hasMyReaction(item.id, "palec")}
                    onClick={() => addReaction(item.id, "palec")}
                  />

                  <ReactionButton
                    label="👀 Viděl jsem"
                    active={hasMyReaction(item.id, "videl")}
                    onClick={() => addReaction(item.id, "videl")}
                  />

                  <ReactionButton
                    label="✅ Hotovo"
                    active={hasMyReaction(item.id, "hotovo")}
                    onClick={() => addReaction(item.id, "hotovo")}
                  />
                </div>

                <div className="text-reaction-row">
                  <input
                    value={textReactionByMessageId[item.id] ?? ""}
                    onChange={(event) =>
                      setTextReactionByMessageId((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Textová reakce..."
                    className="input"
                  />

                  <button
                    type="button"
                    onClick={() => addReaction(item.id, "text")}
                    className="small-secondary-button"
                  >
                    Odeslat reakci
                  </button>
                </div>

                {itemReactions.length > 0 && (
                  <div className="reactions-box">
                    <strong>Reakce</strong>

                    {itemReactions.map((reaction) => (
                      <div key={reaction.id} className="reaction-item">
                        <span className="reaction-icon">
                          {reactionLabels[reaction.reaction_type]}
                        </span>

                        <strong>{getProfileName(reaction.profile_id)}</strong>

                        {reaction.reaction_type === "text" && reaction.text && (
                          <span>: {reaction.text}</span>
                        )}

                        <span className="reaction-time">
                          {" "}
                          ·{" "}
                          {new Date(reaction.created_at).toLocaleString(
                            "cs-CZ"
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <button onClick={signOut} className="logout-button mobile-logout-button">
          Odhlásit
        </button>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MiniStat({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "default" | "green";
}) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className={tone === "green" ? "stat-value green" : "stat-value"}>
        {value}
      </div>
      <div className="stat-description">{description}</div>
    </div>
  );
}

function ReactionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "reaction-button active" : "reaction-button"}
    >
      {label}
    </button>
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

      .app-layout {
        min-height: 100vh;
        background: #020617;
        color: #f8fafc;
        display: grid;
        grid-template-columns: 280px 1fr;
      }

      .sidebar {
        background: #020617;
        border-right: 1px solid #1e293b;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }

      .brand-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 18px;
        padding: 18px;
        margin-bottom: 8px;
      }

      .brand-kicker {
        color: #93c5fd;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 10px;
      }

      .brand-title {
        font-size: 23px;
        font-weight: 950;
        margin-bottom: 18px;
      }

      .brand-subtitle {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.5;
      }

      .side-label {
        color: #64748b;
        text-transform: uppercase;
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 8px;
      }

      .user-select {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 13px 14px;
        color: #f8fafc;
        margin-bottom: 4px;
      }

      .nav {
        display: grid;
        gap: 8px;
      }

      .nav-link {
        display: block;
        text-decoration: none;
        background: #0f172a;
        border: 1px solid #1e293b;
        color: #f8fafc;
        border-radius: 12px;
        padding: 14px 15px;
        font-weight: 900;
      }

      .nav-link.active {
        background: #2563eb;
        border-color: #60a5fa;
      }

      .profile-card {
        margin-top: auto;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 14px;
        display: grid;
        gap: 5px;
      }

      .profile-card strong {
        color: #f8fafc;
        font-weight: 900;
      }

      .profile-card span {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.6;
      }

      .sidebar-spacer {
        flex: 1;
        min-height: 14px;
      }

      .logout-button {
        background: #991b1b;
        border: 1px solid #7f1d1d;
        color: #fee2e2;
        border-radius: 13px;
        padding: 13px 14px;
        font-weight: 900;
        cursor: pointer;
      }

      .mobile-logout-button {
        display: none;
      }

      .content {
        padding: 34px 38px;
        display: grid;
        gap: 18px;
        align-content: start;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
      }

      .topbar h1 {
        margin: 0;
        font-size: 36px;
        font-weight: 950;
        letter-spacing: -0.03em;
      }

      .topbar p {
        margin: 10px 0 0;
        color: #cbd5e1;
        font-size: 16px;
      }

      .primary-button {
        background: #2563eb;
        color: white;
        border: 0;
        border-radius: 15px;
        padding: 14px 20px;
        font-weight: 950;
        font-size: 16px;
        cursor: pointer;
        box-shadow: 0 18px 40px rgba(37,99,235,0.22);
      }

      .secondary-button,
      .save-button,
      .delete-button,
      .small-secondary-button {
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .secondary-button {
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #334155;
        padding: 11px 15px;
      }

      .save-button {
        background: #2563eb;
        color: white;
        border: 0;
        padding: 12px 17px;
      }

      .delete-button {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
        padding: 10px 14px;
      }

      .small-secondary-button {
        background: #1e293b;
        border: 1px solid #334155;
        color: #f8fafc;
        padding: 9px 12px;
      }

      .error-box {
        background: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fecaca;
        padding: 13px;
        border-radius: 14px;
      }

      .success-box {
        background: #052e16;
        border: 1px solid #166534;
        color: #bbf7d0;
        padding: 13px;
        border-radius: 14px;
      }

      .top-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 18px;
      }

      .card,
      .message-card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 24px;
        padding: 22px;
      }

      .card-header {
        margin-bottom: 16px;
      }

      .card-header h2 {
        margin: 0;
        font-size: 25px;
        font-weight: 950;
        letter-spacing: -0.02em;
      }

      .card-header p {
        color: #93a4bd;
        margin: 5px 0 0;
        font-size: 14px;
      }

      .empty-box {
        background: #020617;
        border: 1px dashed #334155;
        border-radius: 15px;
        padding: 17px;
        color: #cbd5e1;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(120px, 1fr));
        gap: 12px;
      }

      .stat-box {
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 16px;
        padding: 14px;
      }

      .stat-label {
        color: #94a3b8;
        font-size: 13px;
        font-weight: 900;
      }

      .stat-value {
        margin-top: 6px;
        color: #f8fafc;
        font-size: 30px;
        font-weight: 950;
      }

      .stat-value.green {
        color: #86efac;
      }

      .stat-description {
        margin-top: 3px;
        color: #64748b;
        font-size: 13px;
      }

      .message-form-card {
        display: grid;
        gap: 14px;
      }

      .form-top {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
      }

      .form-top h2 {
        margin: 0;
        font-size: 25px;
        font-weight: 950;
      }

      .form-top p {
        color: #93a4bd;
        margin: 5px 0 0;
        font-size: 14px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 12px;
      }

      .field {
        display: grid;
        gap: 7px;
      }

      .field span {
        color: #cbd5e1;
        font-weight: 800;
        font-size: 14px;
      }

      .input,
      .textarea {
        width: 100%;
        background: #020617;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 12px;
        outline: none;
      }

      .textarea {
        min-height: 120px;
        resize: vertical;
      }

      .multi-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .multi-header h3 {
        margin: 0;
        color: #f8fafc;
        font-size: 18px;
        font-weight: 950;
      }

      .multi-header p {
        color: #93a4bd;
        margin: 5px 0 0;
        font-size: 14px;
      }

      .small-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .profile-picker {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 9px;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 15px;
        padding: 14px;
      }

      .profile-checkbox {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 12px;
        padding: 11px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        color: #cbd5e1;
      }

      .profile-checkbox.active {
        border: 1px solid #60a5fa;
        background: #1d4ed8;
        color: #f8fafc;
      }

      .profile-checkbox span {
        display: grid;
        gap: 3px;
      }

      .profile-checkbox small {
        color: inherit;
        opacity: 0.85;
      }

      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .message-list {
        display: grid;
        gap: 14px;
      }

      .message-top {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .message-top h2 {
        font-size: 24px;
        font-weight: 950;
        margin: 0 0 6px;
      }

      .message-meta {
        color: #94a3b8;
        font-size: 14px;
        line-height: 1.5;
      }

      .message-body {
        color: #e2e8f0;
        line-height: 1.6;
        white-space: pre-wrap;
        margin-bottom: 14px;
      }

      .reaction-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .reaction-button {
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid #334155;
        background: #020617;
        color: white;
        cursor: pointer;
        font-weight: 800;
      }

      .reaction-button.active {
        border: 1px solid #60a5fa;
        background: #1d4ed8;
      }

      .text-reaction-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .text-reaction-row .input {
        flex: 1 1 240px;
      }

      .reactions-box {
        background: #020617;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 12px;
        display: grid;
        gap: 8px;
      }

      .reaction-item {
        color: #cbd5e1;
        line-height: 1.5;
      }

      .reaction-icon {
        margin-right: 6px;
      }

      .reaction-time {
        color: #64748b;
        font-size: 13px;
      }

      @media (max-width: 1100px) {
        .top-grid {
          grid-template-columns: 1fr;
        }

        .stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 980px) {
        .app-layout {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: relative;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid #1e293b;
        }

        .profile-card {
          margin-top: 12px;
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
      }

      @media (max-width: 720px) {
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

        .content {
          padding: 14px;
        }

        .topbar {
          display: grid;
          gap: 14px;
          margin-bottom: 0;
        }

        .topbar h1 {
          font-size: 30px;
          line-height: 1.05;
        }

        .topbar p {
          font-size: 15px;
          line-height: 1.45;
        }

        .primary-button,
        .secondary-button,
        .save-button,
        .delete-button,
        .small-secondary-button {
          width: 100%;
          min-height: 48px;
        }

        .card,
        .message-card {
          padding: 16px;
          border-radius: 20px;
        }

        .card-header h2,
        .form-top h2 {
          font-size: 20px;
        }

        .card-header p,
        .form-top p,
        .multi-header p {
          font-size: 13px;
          line-height: 1.45;
        }

        .stat-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .form-top {
          display: grid;
        }

        .form-grid {
          grid-template-columns: 1fr;
        }

        .input,
        .textarea {
          min-height: 48px;
          font-size: 16px;
        }

        .textarea {
          min-height: 120px;
        }

        .small-actions,
        .actions,
        .reaction-row,
        .text-reaction-row {
          display: grid;
          grid-template-columns: 1fr;
        }

        .profile-picker {
          grid-template-columns: 1fr;
        }

        .profile-checkbox {
          min-height: 48px;
        }

        .message-top {
          display: grid;
        }

        .message-top h2 {
          font-size: 20px;
          line-height: 1.25;
        }

        .message-body {
          font-size: 15px;
        }

        .reaction-button {
          min-height: 44px;
          width: 100%;
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

        .card,
        .message-card {
          padding: 14px;
        }
      }
    `}</style>
  );
}