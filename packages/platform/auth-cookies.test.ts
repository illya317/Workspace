import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_COOKIE_CONTRACT,
  LEGACY_KICKED_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  createAuthCookieContract,
  readSessionCookie,
  setKickedCookie,
  setSessionCookie,
  setWecomLoginCookies,
} from "./auth-cookies";

type CookieCall = {
  name: string;
  value: string;
  options: {
    path: string;
    expires?: Date;
    maxAge?: number;
  };
};

function recorder() {
  const calls: CookieCall[] = [];
  return {
    calls,
    response: {
      cookies: {
        set(name: string, value: string, options: CookieCall["options"]) {
          calls.push({ name, value, options });
        },
      },
    },
  };
}

test("auth cookie names and paths are isolated by basePath", () => {
  const development = createAuthCookieContract("/test/");
  const production = createAuthCookieContract("/workspace");

  assert.equal(development.path, "/test");
  assert.equal(production.path, "/workspace");
  assert.notEqual(development.sessionName, production.sessionName);
  assert.notEqual(development.wecomStateName, production.wecomStateName);
});

test("session writes establish the scoped cookie and expire the legacy root cookie", () => {
  const contract = createAuthCookieContract("/test");
  const { calls, response } = recorder();

  setSessionCookie(response, "signed-session", 30, contract);

  assert.deepEqual(calls.map(({ name, value, options }) => ({
    name,
    value,
    path: options.path,
    expired: options.maxAge === 0,
  })), [
    { name: LEGACY_SESSION_COOKIE_NAME, value: "", path: "/", expired: true },
    { name: contract.sessionName, value: "signed-session", path: "/test", expired: false },
  ]);
});

test("session reads prefer the scoped cookie and temporarily accept the legacy cookie", () => {
  const contract = createAuthCookieContract("/test");
  const scoped = new Request("https://fh-bio.cn/test/api/auth/me", {
    headers: { cookie: `${LEGACY_SESSION_COOKIE_NAME}=legacy; ${contract.sessionName}=scoped` },
  });
  const legacy = new Request("https://fh-bio.cn/test/api/auth/me", {
    headers: { cookie: `${LEGACY_SESSION_COOKIE_NAME}=legacy` },
  });

  assert.equal(readSessionCookie(scoped, contract), "scoped");
  assert.equal(readSessionCookie(legacy, contract), "legacy");
});

test("kicked and WeCom cookies are also scoped and clean up legacy names", () => {
  const contract = createAuthCookieContract("/test");
  const kicked = recorder();
  const wecom = recorder();

  setKickedCookie(kicked.response, contract);
  setWecomLoginCookies(wecom.response, "state", "/test/work", contract);

  assert.ok(kicked.calls.some(({ name, options }) => (
    name === LEGACY_KICKED_COOKIE_NAME && options.path === "/" && options.maxAge === 0
  )));
  assert.ok(kicked.calls.some(({ name, options }) => name === contract.kickedName && options.path === "/test"));
  assert.ok(wecom.calls.some(({ name, options }) => name === contract.wecomStateName && options.path === "/test"));
  assert.ok(wecom.calls.some(({ name, options }) => name === contract.postLoginNextName && options.path === "/test"));
});

test("the default contract remains the production basePath when none is configured", () => {
  if (process.env.NEXT_PUBLIC_BASE_PATH) return;
  assert.equal(AUTH_COOKIE_CONTRACT.path, "/workspace");
});
