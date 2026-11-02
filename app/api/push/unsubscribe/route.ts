import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage, requirePushUser } from "@/lib/server/push-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Odhlášení musí zůstat dostupné i uživateli, kterému administrátor mezitím
    // odebral modul Upozornění. Stále ale ověřujeme jeho přihlášení a vlastnictví.
    const auth = await requirePushUser(request);
    if (!auth.ok) return auth.response;

    let body: { endpoint?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neplatná data požadavku." },
        { status: 400 }
      );
    }

    const endpoint = body.endpoint?.trim();

    if (!endpoint || endpoint.length > 4096) {
      return NextResponse.json(
        { error: "Chybí platný endpoint zařízení." },
        { status: 400 }
      );
    }

    const { data, error: updateError } = await auth.adminClient
      .from("push_subscriptions")
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", auth.user.id)
      .eq("endpoint", endpoint)
      .select("id");

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
      active: false,
      found: (data?.length ?? 0) > 0,
      message: "Upozornění jsou pro toto zařízení vypnutá.",
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
