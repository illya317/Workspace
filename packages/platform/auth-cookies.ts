const DEFAULT_BASE_PATH = "/workspace";
const LEGACY_COOKIE_PATH = "/";

export const LEGACY_SESSION_COOKIE_NAME = "token";
export const LEGACY_KICKED_COOKIE_NAME = "kicked";
export const LEGACY_WECOM_STATE_COOKIE_NAME = "wecom_oauth_state";
export const LEGACY_POST_LOGIN_NEXT_COOKIE_NAME = "post_login_next";

type AuthCookieKind = "session" | "kicked" | "wecom_state" | "post_login_next";

export type AuthCookieContract = {
  path: string;
  sessionName: string;
  kickedName: string;
  wecomStateName: string;
  postLoginNextName: string;
};

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  expires?: Date;
  maxAge?: number;
};

type CookieResponse = {
  cookies: {
    set(name: string, value: string, options: CookieOptions): unknown;
  };
};

function normalizeBasePath(value?: string | null) {
  const raw = String(value ?? DEFAULT_BASE_PATH).trim();
  if (!raw || raw === "/") return "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function cookieName(kind: AuthCookieKind, path: string) {
  const scope = path === "/"
    ? "root"
    : path.slice(1).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root";
  return `workspace_${kind}_${scope}`;
}

export function createAuthCookieContract(basePath?: string | null): AuthCookieContract {
  const path = normalizeBasePath(basePath);
  return {
    path,
    sessionName: cookieName("session", path),
    kickedName: cookieName("kicked", path),
    wecomStateName: cookieName("wecom_state", path),
    postLoginNextName: cookieName("post_login_next", path),
  };
}

export const AUTH_COOKIE_CONTRACT = createAuthCookieContract(process.env.NEXT_PUBLIC_BASE_PATH);

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

function expireCookie(
  response: CookieResponse,
  name: string,
  path: string,
  httpOnly: boolean,
) {
  response.cookies.set(name, "", {
    httpOnly,
    secure: secureCookie(),
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path,
  });
}

function readCookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function readAuthCookie(
  request: Request,
  currentName: string,
  legacyName: string,
) {
  return readCookieValue(request, currentName) ?? readCookieValue(request, legacyName);
}

export function readSessionCookie(
  request: Request,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  return readAuthCookie(request, contract.sessionName, LEGACY_SESSION_COOKIE_NAME);
}

export function readWecomStateCookie(
  request: Request,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  return readAuthCookie(request, contract.wecomStateName, LEGACY_WECOM_STATE_COOKIE_NAME);
}

export function readPostLoginNextCookie(
  request: Request,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  return readAuthCookie(request, contract.postLoginNextName, LEGACY_POST_LOGIN_NEXT_COOKIE_NAME);
}

export function setSessionCookie(
  response: CookieResponse,
  token: string,
  maxAge: number,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  expireCookie(response, LEGACY_SESSION_COOKIE_NAME, LEGACY_COOKIE_PATH, true);
  response.cookies.set(contract.sessionName, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge,
    path: contract.path,
  });
}

export function clearSessionCookies(
  response: CookieResponse,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  expireCookie(response, contract.sessionName, contract.path, true);
  expireCookie(response, LEGACY_SESSION_COOKIE_NAME, LEGACY_COOKIE_PATH, true);
}

export function setKickedCookie(
  response: CookieResponse,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  expireCookie(response, LEGACY_KICKED_COOKIE_NAME, LEGACY_COOKIE_PATH, false);
  response.cookies.set(contract.kickedName, "1", {
    httpOnly: false,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: 60,
    path: contract.path,
  });
}

export function setWecomLoginCookies(
  response: CookieResponse,
  state: string,
  nextPath: string | null,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  clearWecomLoginCookies(response, contract);
  response.cookies.set(contract.wecomStateName, state, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: 60 * 5,
    path: contract.path,
  });
  if (nextPath) {
    response.cookies.set(contract.postLoginNextName, nextPath, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      maxAge: 60 * 5,
      path: contract.path,
    });
  }
}

export function clearWecomLoginCookies(
  response: CookieResponse,
  contract: AuthCookieContract = AUTH_COOKIE_CONTRACT,
) {
  expireCookie(response, contract.wecomStateName, contract.path, true);
  expireCookie(response, contract.postLoginNextName, contract.path, true);
  expireCookie(response, LEGACY_WECOM_STATE_COOKIE_NAME, LEGACY_COOKIE_PATH, true);
  expireCookie(response, LEGACY_POST_LOGIN_NEXT_COOKIE_NAME, LEGACY_COOKIE_PATH, true);
}
