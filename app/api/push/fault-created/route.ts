import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import {
  defaultPermissionsForRole,
  hasAccess,
  type AccessLevel,
  type AppModule,
  type UserRole,
} from "@/lib/permissions";
import {
  getErrorMessage,
  getErrorStatusCode,
  requirePushUser,
} from "@/lib/server/push-auth";

export const runtime = "nodejs";

type FaultRow = {
  id: string;
  elevator_id: string | null;
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
  role: UserRole;
  active: boolean;
};

type PermissionRow = {
  profile_id: string;
  module: AppModule;
  access_level: AccessLevel;
};

type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
};

const dispatcherRoles: UserRole[] = [
  "admin",
  "vedouci_technik",
  "sekretariat",
];

function effectiveAccess(
  profile: ProfileRow,
  permissionRows: PermissionRow[],
  appModule: AppModule
) {
  if (profile.role === "admin") return "manage" as const;

  return (
    permissionRows.find(
      (permission) =>
        permission.profile_id === profile.id && permission.module === appModule
    )?.access_level ?? defaultPermissionsForRole(profile.role)[appModule]
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePushUser(request, {
      module: "faults",
      level: "manage",
    });
    if (!auth.ok) return auth.response;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return NextResponse.json(
        { error: "Chybí VAPID nastavení serveru." },
        { status: 500 }
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

    const faultId = body.fault_id?.trim();

    if (!faultId) {
      return NextResponse.json(
        { error: "Chybí ID poruchy." },
        { status: 400 }
      );
    }

    // Nejdřív se porucha načte klientem uživatele. Tím se uplatní stejná RLS
    // viditelnost jako na stránce Poruchy a service role ji nemůže obejít.
    const { data: visibleFault, error: visibleFaultError } =
      await auth.authClient
        .from("faults")
        .select("id, created_by")
        .eq("id", faultId)
        .maybeSingle();

    if (visibleFaultError || !visibleFault) {
      return NextResponse.json(
        { error: "Tuto poruchu nemůžeš použít pro rozeslání upozornění." },
        { status: 403 }
      );
    }

    const { data: callerProfileData, error: callerProfileError } =
      await auth.adminClient
        .from("profiles")
        .select("id, role, active")
        .eq("id", auth.user.id)
        .eq("active", true)
        .maybeSingle();

    if (callerProfileError || !callerProfileData) {
      return NextResponse.json(
        { error: "Aktivní profil uživatele nebyl nalezen." },
        { status: 403 }
      );
    }

    const callerProfile = callerProfileData as ProfileRow;
    const isDispatcher = dispatcherRoles.includes(callerProfile.role);

    if (!isDispatcher && visibleFault.created_by !== auth.user.id) {
      return NextResponse.json(
        { error: "Upozornění k poruše může rozeslat její autor nebo dispečink." },
        { status: 403 }
      );
    }

    const { data: faultData, error: faultError } = await auth.adminClient
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
            faultError?.message || "Porucha pro upozornění nebyla nalezena.",
        },
        { status: 404 }
      );
    }

    const fault = faultData as FaultRow;
    const eventKey = `fault-created:${fault.id}`;

    const { error: eventError } = await auth.adminClient
      .from("push_notification_events")
      .insert({
        event_key: eventKey,
        event_type: "fault_created",
        source_id: fault.id,
        created_by: auth.user.id,
      });

    if (eventError?.code === "23505") {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        sent: 0,
        total: 0,
        message: "Upozornění k této poruše už bylo rozesláno.",
      });
    }

    if (eventError) {
      return NextResponse.json(
        {
          error: `Nepodařilo se evidovat rozeslání: ${eventError.message}`,
        },
        { status: 400 }
      );
    }

    const { data: assigneesData, error: assigneesError } =
      await auth.adminClient
        .from("fault_assignees")
        .select("profile_id")
        .eq("fault_id", fault.id);

    if (assigneesError) {
      await auth.adminClient
        .from("push_notification_events")
        .delete()
        .eq("event_key", eventKey);

      return NextResponse.json(
        {
          error: `Nepodařilo se načíst přiřazené techniky: ${assigneesError.message}`,
        },
        { status: 400 }
      );
    }

    const assignees = (assigneesData ?? []) as FaultAssigneeRow[];

    const { data: officeProfilesData, error: officeProfilesError } =
      await auth.adminClient
        .from("profiles")
        .select("id, role, active")
        .eq("active", true)
        .in("role", dispatcherRoles);

    if (officeProfilesError) {
      await auth.adminClient
        .from("push_notification_events")
        .delete()
        .eq("event_key", eventKey);

      return NextResponse.json(
        {
          error: `Nepodařilo se načíst uživatele pro upozornění: ${officeProfilesError.message}`,
        },
        { status: 400 }
      );
    }

    const candidateIds = Array.from(
      new Set(
        [
          ...(officeProfilesData ?? []).map((profile) => profile.id),
          fault.main_technician_id,
          ...assignees.map((assignee) => assignee.profile_id),
        ].filter(Boolean) as string[]
      )
    );

    if (candidateIds.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        total: 0,
        message: "Není komu poslat upozornění.",
      });
    }

    const [{ data: profilesData, error: profilesError }, permissionsResult] =
      await Promise.all([
        auth.adminClient
          .from("profiles")
          .select("id, role, active")
          .in("id", candidateIds)
          .eq("active", true),
        auth.adminClient
          .from("user_module_permissions")
          .select("profile_id, module, access_level")
          .in("profile_id", candidateIds)
          .in("module", ["faults", "notifications"]),
      ]);

    if (profilesError || permissionsResult.error) {
      await auth.adminClient
        .from("push_notification_events")
        .delete()
        .eq("event_key", eventKey);

      return NextResponse.json(
        {
          error:
            profilesError?.message ||
            permissionsResult.error?.message ||
            "Nepodařilo se ověřit příjemce upozornění.",
        },
        { status: 400 }
      );
    }

    const profiles = (profilesData ?? []) as ProfileRow[];
    const permissionRows = (permissionsResult.data ?? []) as PermissionRow[];
    const recipientIds = profiles
      .filter(
        (profile) =>
          hasAccess(effectiveAccess(profile, permissionRows, "faults"), "view") &&
          hasAccess(
            effectiveAccess(profile, permissionRows, "notifications"),
            "view"
          )
      )
      .map((profile) => profile.id);

    if (recipientIds.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        total: 0,
        message: "Příjemci nemají povolené upozornění na poruchy.",
      });
    }

    const { data: subscriptionsData, error: subscriptionsError } =
      await auth.adminClient
        .from("push_subscriptions")
        .select("id, profile_id, endpoint, p256dh, auth, active")
        .in("profile_id", recipientIds)
        .eq("active", true);

    if (subscriptionsError) {
      await auth.adminClient
        .from("push_notification_events")
        .delete()
        .eq("event_key", eventKey);

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
        message: "Cíloví uživatelé nemají na telefonu zapnutá upozornění.",
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: fault.priority === "uvizle_osoby" ? "Uvízlé osoby" : "Nová porucha",
      body:
        fault.priority === "uvizle_osoby"
          ? "Byla založena urgentní porucha s uvízlými osobami."
          : "Byla vytvořena nová porucha. Otevři aplikaci.",
      url: "/faults",
      tag: `fault-${fault.id}`,
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

    if (sent === 0 && errors.length > 0) {
      // Když selhal celý poskytovatel push, dovolíme bezpečný pozdější pokus.
      await auth.adminClient
        .from("push_notification_events")
        .delete()
        .eq("event_key", eventKey);

      return NextResponse.json(
        {
          error: errors[0]?.message || "Nepodařilo se odeslat upozornění.",
          sent,
          total: subscriptions.length,
          errors,
        },
        { status: 502 }
      );
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
