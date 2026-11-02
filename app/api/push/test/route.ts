import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import {
  getErrorMessage,
  getErrorStatusCode,
  requirePushUser,
} from "@/lib/server/push-auth";

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
  try {
    const auth = await requirePushUser(request, {
      module: "notifications",
      level: "view",
    });
    if (!auth.ok) return auth.response;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return NextResponse.json(
        {
          error:
            "Chybí VAPID nastavení serveru. Zkontroluj ve Vercelu NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY a VAPID_SUBJECT.",
        },
        { status: 500 }
      );
    }

    let endpoint: string | undefined;

    try {
      const body = (await request.json()) as { endpoint?: string };
      endpoint = body.endpoint?.trim();
    } catch {
      // Endpoint je volitelný kvůli zpětné kompatibilitě. Bez něj se testují
      // všechna aktivní zařízení přihlášeného uživatele.
    }

    if (endpoint && endpoint.length > 4096) {
      return NextResponse.json(
        { error: "Endpoint zařízení je příliš dlouhý." },
        { status: 400 }
      );
    }

    let subscriptionsQuery = auth.adminClient
      .from("push_subscriptions")
      .select("id, profile_id, endpoint, p256dh, auth, active")
      .eq("profile_id", auth.user.id)
      .eq("active", true);

    if (endpoint) subscriptionsQuery = subscriptionsQuery.eq("endpoint", endpoint);

    const { data: subscriptionsData, error: subscriptionsError } =
      await subscriptionsQuery;

    if (subscriptionsError) {
      return NextResponse.json(
        {
          error: `Nepodařilo se načíst uložené zařízení: ${subscriptionsError.message}`,
        },
        { status: 400 }
      );
    }

    const subscriptions = (subscriptionsData ?? []) as PushSubscriptionRow[];

    if (subscriptions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Pro toto zařízení nejsou upozornění zapnutá. Nejdřív je zapni přepínačem.",
        },
        { status: 400 }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: "Test upozornění",
      body: "Push notifikace z aplikace Výtahy DC fungují.",
      url: "/dashboard",
      tag: `push-test-${Date.now()}`,
    });

    let sent = 0;
    const errors: Array<{
      subscription_id: string;
      statusCode: number | null;
      message: string;
    }> = [];

    for (const subscription of subscriptions) {
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

        sent += 1;
      } catch (error) {
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error);

        errors.push({
          subscription_id: subscription.id,
          statusCode,
          message,
        });

        if (statusCode === 404 || statusCode === 410) {
          await auth.adminClient
            .from("push_subscriptions")
            .update({
              active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
        }
      }
    }

    if (sent === 0) {
      return NextResponse.json(
        {
          error:
            errors[0]?.message ||
            "Nepodařilo se odeslat žádnou push notifikaci.",
          details: errors,
          total: subscriptions.length,
          sent,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent,
      total: subscriptions.length,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Serverová chyba při odesílání push notifikace: ${getErrorMessage(
          error
        )}`,
      },
      { status: 500 }
    );
  }
}
