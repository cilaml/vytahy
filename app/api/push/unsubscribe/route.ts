import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "Neznámá objektová chyba.";
    }
  }

  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Chybí Supabase env proměnné." },
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
        {
          error:
            userError?.message ||
            "Nepodařilo se ověřit přihlášeného uživatele.",
        },
        { status: 401 }
      );
    }

    let body: { endpoint?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neplatná data požadavku." },
        { status: 400 }
      );
    }

    const endpoint = body.endpoint;

    if (!endpoint) {
      return NextResponse.json(
        { error: "Chybí endpoint zařízení." },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from("push_subscriptions")
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", user.id)
      .eq("endpoint", endpoint);

    if (updateError) {
      return NextResponse.json(
        {
          error: `Nepodařilo se vypnout upozornění: ${updateError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Upozornění jsou vypnutá.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Serverová chyba při vypínání upozornění: ${getErrorMessage(
          error
        )}`,
      },
      { status: 500 }
    );
  }
}
