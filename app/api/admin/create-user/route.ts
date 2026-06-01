import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProfileRole =
  | "admin"
  | "vedouci_technik"
  | "technik"
  | "sekretariat"
  | "servis";

type CreateUserPayload = {
  email: string;
  password: string;
  full_name: string;
  phone: string | null;
  role: ProfileRole;
  primary_region_id: string | null;
  can_do_inspections: boolean;
  active: boolean;
  secondary_region_ids: string[];
};

const allowedRoles: ProfileRole[] = [
  "admin",
  "vedouci_technik",
  "technik",
  "sekretariat",
  "servis",
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Create user API route běží. Použij POST z aplikace.",
  });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Na serveru chybí NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY nebo SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  const authorizationHeader = request.headers.get("authorization");
  const token = authorizationHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Chybí přihlašovací token." },
      { status: 401 }
    );
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Nepodařilo se ověřit přihlášeného uživatele." },
      { status: 401 }
    );
  }

  const { data: currentProfile, error: currentProfileError } = await adminClient
    .from("profiles")
    .select("id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (currentProfileError || !currentProfile) {
    return NextResponse.json(
      { error: "Profil přihlášeného uživatele nebyl nalezen." },
      { status: 403 }
    );
  }

  if (!currentProfile.active) {
    return NextResponse.json(
      { error: "Neaktivní uživatel nemůže vytvářet nové účty." },
      { status: 403 }
    );
  }

  const canCreateUser =
    currentProfile.role === "admin" ||
    currentProfile.role === "vedouci_technik" ||
    currentProfile.role === "sekretariat";

  if (!canCreateUser) {
    return NextResponse.json(
      {
        error:
          "Nové uživatele může vytvářet jen admin, vedoucí technik nebo sekretariát.",
      },
      { status: 403 }
    );
  }

  let payload: CreateUserPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data požadavku." },
      { status: 400 }
    );
  }

  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();
  const fullName = payload.full_name?.trim();
  const phone = payload.phone?.trim() || null;

  const requestedRole = payload.role;
  const role: ProfileRole =
    currentProfile.role === "admin" ? requestedRole : "technik";

  const primaryRegionId = payload.primary_region_id || null;
  const canDoInspections = Boolean(payload.can_do_inspections);
  const active = Boolean(payload.active);

  const secondaryRegionIds = Array.isArray(payload.secondary_region_ids)
    ? payload.secondary_region_ids.filter(Boolean)
    : [];

  if (!email) {
    return NextResponse.json({ error: "Vyplň e-mail." }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Heslo musí mít alespoň 6 znaků." },
      { status: 400 }
    );
  }

  if (!fullName) {
    return NextResponse.json({ error: "Vyplň jméno." }, { status: 400 });
  }

  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Neplatná role." }, { status: 400 });
  }

  const { data: authUserData, error: createAuthError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

  if (createAuthError || !authUserData.user) {
    return NextResponse.json(
      {
        error:
          createAuthError?.message ??
          "Nepodařilo se vytvořit uživatele v Supabase Auth.",
      },
      { status: 400 }
    );
  }

  const createdUserId = authUserData.user.id;

  const { error: profileInsertError } = await adminClient
    .from("profiles")
    .insert({
      id: createdUserId,
      email,
      full_name: fullName,
      phone,
      role,
      primary_region_id: primaryRegionId,
      can_do_inspections: canDoInspections,
      active,
      updated_at: new Date().toISOString(),
    });

  if (profileInsertError) {
    await adminClient.auth.admin.deleteUser(createdUserId);

    return NextResponse.json(
      {
        error: `Uživatel vznikl v Auth, ale nepovedlo se vytvořit profil. Uživatel byl vrácen zpět. Chyba: ${profileInsertError.message}`,
      },
      { status: 400 }
    );
  }

  const cleanSecondaryRegionIds = secondaryRegionIds.filter(
    (regionId) => regionId !== primaryRegionId
  );

  if (cleanSecondaryRegionIds.length > 0) {
    const { error: secondaryRegionsError } = await adminClient
      .from("profile_regions")
      .insert(
        cleanSecondaryRegionIds.map((regionId) => ({
          profile_id: createdUserId,
          region_id: regionId,
        }))
      );

    if (secondaryRegionsError) {
      return NextResponse.json(
        {
          error: `Uživatel byl vytvořen, ale nepovedlo se uložit sekundární rajony: ${secondaryRegionsError.message}`,
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: createdUserId,
  });
}