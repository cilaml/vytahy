import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";

export const runtime = "nodejs";

type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Chybí Supabase env proměnné." },
      { status: 500 }
    );
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json(
      {
        error:
          "Chybí VAPID env proměnné: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY nebo VAPID_SUBJECT.",
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

  const { data: subscriptionsData, error: subscriptionsError } =
    await adminClient
      .from("push_subscriptions")
      .select("id, profile_id, endpoint, p256dh, auth, active")
      .eq("profile_id", user.id)
      .eq("active", true);

  if (subscriptionsError) {
    return NextResponse.json(
      {
        error: `Nepodařilo se načíst uložená zařízení: ${subscriptionsError.message}`,
      },
      { status: 400 }
    );
  }

  const subscriptions = (subscriptionsData ?? []) as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    return NextResponse.json(
      {
        error:
          "Pro tvůj účet není uložené žádné zařízení. Nejdřív klikni na Zapnout upozornění.",
      },
      { status: 400 }
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({
    title: "Test upozornění",
    body: "Push notifikace z aplikace Výtahy Servis fungují.",
    url: "/dashboard",
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );

        return {
          id: subscription.id,
          ok: true,
        };
      } catch (error) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from("push_subscriptions")
            .update({
              active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
        }

        return {
          id: subscription.id,
          ok: false,
          statusCode,
          error: error instanceof Error ? error.message : "Neznámá chyba",
        };
      }
    })
  );

  const sent = results.filter(
    (result) => result.status === "fulfilled" && result.value.ok
  ).length;

  return NextResponse.json({
    ok: true,
    sent,
    total: subscriptions.length,
  });
}