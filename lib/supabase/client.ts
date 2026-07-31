import { createBrowserClient } from "@supabase/ssr";
import {
  applyAuthPersistence,
  AUTH_COOKIE_MAX_AGE,
  REMEMBER_ME_COOKIE,
  shouldPersistAuthCookies,
} from "@/lib/supabase/auth-persistence";

type BrowserCookieOptions = {
  domain?: string;
  expires?: Date;
  maxAge?: number;
  partitioned?: boolean;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

function decodeCookiePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getBrowserCookies() {
  if (typeof document === "undefined" || !document.cookie) {
    return [];
  }

  return document.cookie.split(/;\s*/).flatMap((cookie) => {
    const separator = cookie.indexOf("=");

    if (separator < 0) {
      return [];
    }

    return [
      {
        name: decodeCookiePart(cookie.slice(0, separator)),
        value: decodeCookiePart(cookie.slice(separator + 1)),
      },
    ];
  });
}

function serializeBrowserCookie(
  name: string,
  value: string,
  options: BrowserCookieOptions
) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.partitioned) {
    parts.push("Partitioned");
  }
  if (options.priority) {
    parts.push(`Priority=${options.priority}`);
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite === true ? "Strict" : options.sameSite}`);
  }

  return parts.join("; ");
}

function getRememberMePreference() {
  return getBrowserCookies().find(({ name }) => name === REMEMBER_ME_COOKIE)?.value;
}

export function setRememberMePreference(rememberMe: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = serializeBrowserCookie(
    REMEMBER_ME_COOKIE,
    rememberMe ? "1" : "0",
    {
      path: "/",
      sameSite: "lax",
      ...(rememberMe ? { maxAge: AUTH_COOKIE_MAX_AGE } : {}),
    }
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return getBrowserCookies();
        },
        setAll(cookiesToSet) {
          const persist = shouldPersistAuthCookies(getRememberMePreference());

          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serializeBrowserCookie(
              name,
              value,
              applyAuthPersistence(options, persist)
            );
          });
        },
      },
    }
  );
}
