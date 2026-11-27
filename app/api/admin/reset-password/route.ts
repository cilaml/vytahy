import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ResetPasswordPayload = {
  profile_id?: string;
  password?: string;
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Reset password API route běží. Použij POST z aplikace.",
  });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Na serveru chybí konfigurace pro správu uživatelů." },
      { status: 500 }
    );
  }

  const authorizationHeader = request.headers.get("authorization");
  const token = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice(7)
    : null;

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

  if (!currentProfile.active || currentProfile.role !== "admin") {
    return NextResponse.json(
      { error: "Nové heslo může nastavovat pouze aktivní admin." },
      { status: 403 }
    );
  }

  let payload: ResetPasswordPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data požadavku." },
      { status: 400 }
    );
  }

  const profileId = payload.profile_id?.trim();
  const password = payload.password ?? "";

  if (!profileId) {
    return NextResponse.json(
      { error: "Chybí uživatel, kterému se má změnit heslo." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Nové heslo musí mít alespoň 6 znaků." },
      { status: 400 }
    );
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (targetProfileError || !targetProfile) {
    return NextResponse.json(
      { error: "Uživatel pro změnu hesla nebyl nalezen." },
      { status: 404 }
    );
  }

  const { error: updateError } =
    await adminClient.auth.admin.updateUserById(profileId, { password });

  if (updateError) {
    return NextResponse.json(
      { error: `Heslo se nepodařilo změnit: ${updateError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated_user_id: profileId,
    full_name: targetProfile.full_name,
  });
}
