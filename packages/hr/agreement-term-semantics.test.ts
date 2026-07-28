import assert from "node:assert/strict";
import test from "node:test";

import {
  agreementTermExpiryLabel,
  contractPeriodLabel,
  preferredAgreementTerm,
} from "./agreement-term-semantics";

const baseTerm = {
  sequence: 1,
  termKind: "initial" as const,
  effectiveFrom: "2017-12-28",
  effectiveThrough: null,
  recordState: "confirmed" as const,
  temporalState: "current" as const,
};

test("missing fixed expiry is not rendered as indefinite", () => {
  assert.equal(agreementTermExpiryLabel(baseTerm), "到期日期待补充");
  assert.equal(contractPeriodLabel(baseTerm), "2017-12-28 — 到期日期待补充");
  assert.equal(
    agreementTermExpiryLabel({ ...baseTerm, termKind: "permanent" }),
    "无固定期限",
  );
});

test("preferred term follows temporal meaning instead of raw append order", () => {
  const current = { ...baseTerm, sequence: 2, termKind: "permanent" as const };
  const correctedHistory = {
    ...baseTerm,
    sequence: 1,
    effectiveFrom: "2009-06-10",
    effectiveThrough: "2014-06-09",
    temporalState: "past" as const,
  };
  assert.equal(preferredAgreementTerm([current, correctedHistory]), current);
});

test("superseded rows are never selected as the preferred term", () => {
  const superseded = { ...baseTerm, recordState: "superseded" as const };
  assert.equal(preferredAgreementTerm([superseded]), null);
});
