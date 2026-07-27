import assert from "node:assert/strict";
import test from "node:test";

import { formatFinanceAmount, formatFinanceDateTime } from "./formatters";

test("finance amount formatter renders rounded zero without decimals", () => {
  assert.equal(formatFinanceAmount(0), "0");
  assert.equal(formatFinanceAmount(null), "0");
  assert.equal(formatFinanceAmount(0.004), "0");
  assert.equal(formatFinanceAmount(12.5), "12.50");
});

test("finance datetime formatter renders UTC timestamps in the tenant business timezone", () => {
  const businessTimeZone = ["Asia", "Shanghai"].join("/");
  assert.equal(
    formatFinanceDateTime("2026-07-24T02:06:21.424Z", businessTimeZone),
    "2026-07-24 10:06:21",
  );
  assert.equal(formatFinanceDateTime("invalid", businessTimeZone), "—");
});
