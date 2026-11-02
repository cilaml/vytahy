import { NextRequest, NextResponse } from "next/server";
import { requirePushUser } from "@/lib/server/push-auth";

export const runtime = "nodejs";

type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function isValidSubscription(subscription: PushSubscriptionPayload) {
  if (
    !subscription.endpoint ||
    subscription.endpoint.length > 4096 ||
    !subscription.keys?.p256dh ||
    subscription.keys.p256dh.length > 1024 ||
    !subscription.keys?.auth ||
    subscription.keys.auth.length > 1024
  ) {
    return false;
  }

  try {
    return new URL(subscription.endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePushUser(request, {
    module: "notifications",
    level: "view",
  });

  if (!auth.ok) return auth.response;

  let subscription: PushSubscriptionPayload;

  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data push subscription." },
      { status: 400 }
    );
  }

  if (!isValidSubscription(subscription)) {
    return NextResponse.json(
      { error: "Push subscription neobsahuje platné údaje." },
      { status: 400 }
    );
  }

  // Endpoint patří zařízení, ne účtu. Při přihlášení jiného uživatele na
  // stejném telefonu se proto záznam bezpečně převede na nový účet.
  const { error: upsertError } = await auth.adminClient
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: auth.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers.get("user-agent"),
        active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "endpoint",
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
    active: true,
  });
}
