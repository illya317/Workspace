import assert from "node:assert/strict";
import test from "node:test";

import { taxRegistrationPeriodScope } from "./registration-period-scope";

test("registration scope includes historical ended registrations whose dated interval covers the period", () => {
  assert.deepEqual(taxRegistrationPeriodScope({
    status: "ended", effectiveFrom: "2025-01-01", effectiveThrough: "2026-06-30",
  }, { year: 2026, month: 6 }), { inScope: true, blockerCode: null });
});

test("registration scope blocks unbounded ended and undated suspended states", () => {
  assert.deepEqual(taxRegistrationPeriodScope({
    status: "ended", effectiveFrom: "2025-01-01", effectiveThrough: null,
  }, { year: 2026, month: 6 }), { inScope: true, blockerCode: "registration_end_date_missing" });
  assert.deepEqual(taxRegistrationPeriodScope({
    status: "suspended", effectiveFrom: "2025-01-01", effectiveThrough: null,
  }, { year: 2026, month: 6 }), { inScope: true, blockerCode: "registration_suspended_scope_unproven" });
});

test("registration scope excludes draft and intervals outside the target period", () => {
  assert.equal(taxRegistrationPeriodScope({
    status: "ended", effectiveFrom: "2025-01-01", effectiveThrough: "2026-05-31",
  }, { year: 2026, month: 6 }).inScope, false);
  assert.equal(taxRegistrationPeriodScope({
    status: "active", effectiveFrom: "2026-07-01", effectiveThrough: null,
  }, { year: 2026, month: 6 }).inScope, false);
  assert.equal(taxRegistrationPeriodScope({
    status: "draft", effectiveFrom: "2025-01-01", effectiveThrough: null,
  }, { year: 2026, month: 6 }).inScope, false);
});
