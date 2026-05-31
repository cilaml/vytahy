import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DeleteUserPayload = {
  profile_id: string;
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Delete user API route běží. Použij POST z aplikace.",
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
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (currentProfileError || !currentProfile) {
    return NextResponse.json(
      { error: "Profil přihlášeného uživatele nebyl nalezen." },
      { status: 403 }
    );
  }

  if (
    currentProfile.role !== "admin" &&
    currentProfile.role !== "vedouci_technik"
  ) {
    return NextResponse.json(
      { error: "Uživatele může mazat jen admin nebo vedoucí technik." },
      { status: 403 }
    );
  }

  let payload: DeleteUserPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data požadavku." },
      { status: 400 }
    );
  }

  const profileId = payload.profile_id;

  if (!profileId) {
    return NextResponse.json(
      { error: "Chybí ID uživatele ke smazání." },
      { status: 400 }
    );
  }

  if (profileId === user.id) {
    return NextResponse.json(
      { error: "Nemůžeš smazat sám sebe." },
      { status: 400 }
    );
  }

  const { data: profileToDelete, error: profileToDeleteError } =
    await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", profileId)
      .maybeSingle();

  if (profileToDeleteError || !profileToDelete) {
    return NextResponse.json(
      { error: "Uživatel ke smazání nebyl nalezen." },
      { status: 404 }
    );
  }

  const { error: deleteProfileRegionsError } = await adminClient
    .from("profile_regions")
    .delete()
    .eq("profile_id", profileId);

  if (deleteProfileRegionsError) {
    return NextResponse.json(
      {
        error: `Nepodařilo se smazat sekundární rajony uživatele: ${deleteProfileRegionsError.message}`,
      },
      { status: 400 }
    );
  }

  const { error: deleteProfileError } = await adminClient
    .from("profiles")
    .delete()
    .eq("id", profileId);

  if (deleteProfileError) {
    return NextResponse.json(
      {
        error: `Nepodařilo se smazat profil z databáze. Uživatel má nejspíš vazbu na poruchy, servisní záznamy nebo zprávy. V takovém případě ho radši nastav jako neaktivního. Chyba: ${deleteProfileError.message}`,
      },
      { status: 400 }
    );
  }

  const { error: deleteAuthError } =
    await adminClient.auth.admin.deleteUser(profileId);

  if (deleteAuthError) {
    return NextResponse.json(
      {
        error: `Profil byl smazán z databáze, ale nepodařilo se smazat účet ze Supabase Auth: ${deleteAuthError.message}`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted_user_id: profileId,
  });
}