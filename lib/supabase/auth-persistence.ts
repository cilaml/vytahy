export const REMEMBER_ME_COOKIE = "vytahy-remember-me";

export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

type AuthCookieOptions = {
  expires?: Date;
  maxAge?: number;
};

export function shouldPersistAuthCookies(preference: string | undefined) {
  // Existing users do not have the preference cookie yet. Keeping persistence
  // enabled for them prevents this deployment from unexpectedly logging them out.
  return preference !== "0";
}

export function applyAuthPersistence<T extends AuthCookieOptions>(
  options: T,
  persist: boolean
): T {
  if (persist || options.maxAge === 0) {
    return options;
  }

  const sessionOptions = { ...options };
  delete sessionOptions.expires;
  delete sessionOptions.maxAge;

  return sessionOptions;
}
