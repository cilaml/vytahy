import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  applyAuthPersistence,
  REMEMBER_ME_COOKIE,
  shouldPersistAuthCookies,
} from "@/lib/supabase/auth-persistence";

export async function createClient() {
  const cookieStore = await cookies();
  const persist = shouldPersistAuthCookies(
    cookieStore.get(REMEMBER_ME_COOKIE)?.value
  );

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                applyAuthPersistence(options, persist)
              );
            });
          } catch {
            // Tohle může spadnout v Server Componentě, ale middleware pak session obnoví.
          }
        },
      },
    }
  );
}
