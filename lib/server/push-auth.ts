import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type RequiredAccess = {
  module: string;
  level?: "view" | "manage";
};

type PushAuthSuccess = {
  ok: true;
  user: User;
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
};

type PushAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type PushAuthResult = PushAuthSuccess | PushAuthFailure;

export async function requirePushUser(
  request: NextRequest,
  requiredAccess?: RequiredAccess
): Promise<PushAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Na serveru chybí Supabase env proměnné." },
        { status: 500 }
      ),
    };
  }

  const authorizationHeader = request.headers.get("authorization");
  const tokenMatch = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Chybí přihlašovací token." },
        { status: 401 }
      ),
    };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
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
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            userError?.message ||
            "Nepodařilo se ověřit přihlášeného uživatele.",
        },
        { status: 401 }
      ),
    };
  }

  if (requiredAccess) {
    const { data: hasAccess, error: accessError } = await authClient.rpc(
      "has_module_access",
      {
        target_module: requiredAccess.module,
        required_level: requiredAccess.level ?? "view",
      }
    );

    if (accessError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Nepodařilo se ověřit oprávnění: ${accessError.message}`,
          },
          { status: 500 }
        ),
      };
    }

    if (!hasAccess) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Pro tuto akci nemáš oprávnění." },
          { status: 403 }
        ),
      };
    }
  }

  return {
    ok: true,
    user,
    authClient,
    adminClient,
  };
}

export function getErrorMessage(error: unknown) {
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

export function getErrorStatusCode(error: unknown) {
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
