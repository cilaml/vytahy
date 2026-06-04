import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type FaultRow = {
  id: string;
  elevator_id: string;
  region_id: string | null;
  priority: string;
  status: string;
  main_technician_id: string | null;
  created_by: string | null;
};

type FaultAssigneeRow = {
  profile_id: string;
};

type ProfileRow = {
  id: string;
  role: string;
  active: boolean;
};

type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
};

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

function getErrorStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
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
        { error: "Chybí VAPID env proměnné." },
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

    let body: { fault_id?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neplatná data požadavku." },
        { status: 400 }
      );
    }

    const faultId = body.fault_id;

    if (!faultId) {
      return NextResponse.json(
        { error: "Chybí ID poruchy." },
        { status: 400 }
      );
    }

    const { data: faultData, error: faultError } = await adminClient
      .from("faults")
      .select(
        "id, elevator_id, region_id, priority, status, main_technician_id, created_by"
      )
      .eq("id", faultId)
      .maybeSingle();

    if (faultError || !faultData) {
      return NextResponse.json(
        {
          error:
            faultError?.message || "Porucha pro odeslání upozornění nenalezena.",
        },
        { status: 404 }
      );
    }

    const fault = faultData as FaultRow;

    const { data: assigneesData, error: assigneesError } = await adminClient
      .from("fault_assignees")
      .select("profile_id")
      .eq("fault_id", fault.id);

    if (assigneesError) {
      return NextResponse.json(
        {
          error: `Nepodařilo se načíst přiřazené techniky: ${assigneesError.message}`,
        },
        { status: 400 }
      );
    }

    const assignees = (assigneesData ?? []) as FaultAssigneeRow[];

    const { data: officeProfilesData, error: officeProfilesError } =
      await adminClient
        .from("profiles")
        .select("id, role, active")
        .eq("active", true)
        .in("role", ["admin", "vedouci_technik", "sekretariat"]);

    if (officeProfilesError) {
      return NextResponse.json(
        {
          error: `Nepodařilo se načíst uživatele pro upozornění: ${officeProfilesError.message}`,
        },
        { status: 400 }
      );
    }

    const officeProfiles = (officeProfilesData ?? []) as ProfileRow[];

    const recipientIds = Array.from(
      new Set(
        [
          ...officeProfiles.map((profile) => profile.id),
          fault.main_technician_id,
          ...assignees.map((assignee) => assignee.profile_id),
        ].filter(Boolean) as string[]
      )
    );

    if (recipientIds.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        total: 0,
        message: "Není komu poslat upozornění.",
      });
    }

    const { data: subscriptionsData, error: subscriptionsError } =
      await adminClient
        .from("push_subscriptions")
        .select("id, profile_id, endpoint, p256dh, auth, active")
        .in("profile_id", recipientIds)
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
      return NextResponse.json({
        ok: true,
        sent: 0,
        total: 0,
        message: "Cíloví uživatelé nemají zapnuté upozornění.",
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title:
        fault.priority === "uvizle_osoby"
          ? "Uvízlé osoby"
          : "Nová porucha",
      body:
        fault.priority === "uvizle_osoby"
          ? "Byla založena urgentní porucha s uvízlými osobami."
          : "Byla vytvořena nová porucha. Otevři aplikaci.",
      url: "/faults",
    });

    let sent = 0;
    const errors: Array<{
      subscription_id: string;
      profile_id: string;
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
          profile_id: subscription.profile_id,
          statusCode,
          message,
        });

        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from("push_subscriptions")
            .update({
              active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      total: subscriptions.length,
      recipients: recipientIds.length,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Serverová chyba při odesílání upozornění k poruše: ${getErrorMessage(
          error
        )}`,
      },
      { status: 500 }
    );
  }
}