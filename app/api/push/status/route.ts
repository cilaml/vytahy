import { NextRequest, NextResponse } from "next/server";
import { requirePushUser } from "@/lib/server/push-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requirePushUser(request, {
    module: "notifications",
    level: "view",
  });

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

  const { data, error } = await auth.adminClient
    .from("push_subscriptions")
    .select("active")
    .eq("profile_id", auth.user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Nepodařilo se zjistit stav zařízení: ${error.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    active: data?.active === true,
  });
}
