import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultBusinessCodeConfig,
  formatFinanceAssetCode,
  formatProjectBusinessCode,
  formatSequentialBusinessCode,
  isDepartmentIdentifier,
  normalizeDepartmentIdentifier,
  normalizeBusinessCodeConfig,
} from "./business-code-config";

const tenantDefaults = {
  companyProjectCodePrefix: "EX",
  companyProjectSequenceWidth: 3,
  companyProjectSequenceStart: 1,
  companyProjectSequenceEnd: 99,
  departmentProjectSequenceWidth: 3,
  otherProjectSequenceStart: 101,
};

test("Finance asset format uses company, category, accounting year and five digits", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  assert.equal(formatFinanceAssetCode({
    companyCode: "02",
    categoryCode: "FA-ELECTRONIC",
    year: 2026,
    sequence: 7,
    rule: config.financeAsset,
  }), "02-FA-ELECTRONIC-2026-00007");
});

test("default employee, external-party and project rules share the central formatter", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  assert.equal(formatSequentialBusinessCode(config.employee, 1), "00001");
  assert.equal(formatSequentialBusinessCode(config.customer, 1), "CUS-00001");
  assert.equal(formatSequentialBusinessCode(config.supplier, 1), "SUP-00001");
  assert.equal(formatProjectBusinessCode({
    prefix: config.project.companyPrefix,
    year: 2026,
    sequence: config.project.companySequenceStart,
    separator: config.project.separator,
    yearDigits: config.project.yearDigits,
    sequenceLength: config.project.companySequenceLength,
  }), "EX-26-001");
});

test("organization identifier format and length are tenant configurable", () => {
  const defaults = defaultBusinessCodeConfig(tenantDefaults);
  const normalized = normalizeBusinessCodeConfig({
    ...defaults,
    department: {
      ...defaults.department,
      identifierFormat: "uppercaseAlphanumeric",
      identifierLength: 4,
    },
  }, defaults);
  assert.equal(normalizeDepartmentIdentifier("a-1bc9", normalized.department), "A1BC");
  assert.equal(isDepartmentIdentifier("A1BC", normalized.department), true);
  assert.equal(isDepartmentIdentifier("ABC", normalized.department), false);
});

test("normalization upgrades the legacy Finance asset rule and keeps five digits", () => {
  const defaults = defaultBusinessCodeConfig(tenantDefaults);
  const normalized = normalizeBusinessCodeConfig({
    ...defaults,
    financeAsset: {
      separator: "/",
      sequenceLength: 6,
      sequenceStart: 12,
    },
  }, defaults);
  assert.equal(formatFinanceAssetCode({
    companyCode: "02",
    categoryCode: "IA-LAND-USE",
    year: 2026,
    sequence: 12,
    rule: normalized.financeAsset,
  }), "02/IA-LAND-USE/2026/00012");
  assert.equal(normalized.financeAsset.sequenceStart, 12);
});

test("normalization falls back when a stored Finance asset rule changes the fixed width", () => {
  const defaults = defaultBusinessCodeConfig(tenantDefaults);
  const normalized = normalizeBusinessCodeConfig({
    ...defaults,
    financeAsset: {
      ...defaults.financeAsset,
      segments: defaults.financeAsset.segments.map((segment) => (
        segment.kind === "sequence" ? { ...segment, length: 6 } : segment
      )),
    },
  }, defaults);
  assert.deepEqual(normalized.financeAsset, defaults.financeAsset);
});
