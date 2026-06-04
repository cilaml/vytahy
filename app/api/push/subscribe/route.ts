import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

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

  let subscription: PushSubscriptionPayload;

  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data push subscription." },
      { status: 400 }
    );
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json(
      { error: "Push subscription neobsahuje potřebné údaje." },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent");

  const { error: upsertError } = await adminClient
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
        active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,endpoint",
      }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: `Nepodařilo se uložit zařízení: ${upsertError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
  });
}