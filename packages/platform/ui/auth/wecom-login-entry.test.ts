import assert from "node:assert/strict";
import test from "node:test";

import { resolveWecomLoginEntry } from "./wecom-login-entry";

test("WeCom embedded browser uses direct in-app OAuth", () => {
  assert.equal(resolveWecomLoginEntry({
    userAgent: "Mozilla/5.0 Mobile wxwork/4.1.36",
    maxTouchPoints: 5,
    viewportWidth: 390,
  }), "in-app");
});

test("external mobile browsers show Workbench guidance instead of a custom scheme", () => {
  assert.equal(resolveWecomLoginEntry({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile) Chrome/126.0",
    maxTouchPoints: 5,
    viewportWidth: 390,
  }), "mobile-help");
});

test("desktop browsers retain the official QR login panel", () => {
  assert.equal(resolveWecomLoginEntry({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    maxTouchPoints: 0,
    viewportWidth: 1440,
  }), "desktop-panel");
});
