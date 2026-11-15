export const USERNAME_AUTH_DOMAIN = "accounts.vytahy-dc.invalid";

const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLoginName(value: string) {
  return LOGIN_NAME_PATTERN.test(normalizeLoginName(value));
}

export function loginNameToEmail(value: string) {
  const loginName = normalizeLoginName(value);

  if (!isValidLoginName(loginName)) {
    return null;
  }

  return `${loginName}@${USERNAME_AUTH_DOMAIN}`;
}

export function loginIdentifierToEmail(value: string) {
  const identifier = value.trim().toLowerCase();

  if (!identifier) {
    return null;
  }

  if (identifier.includes("@")) {
    return identifier;
  }

  return loginNameToEmail(identifier);
}
