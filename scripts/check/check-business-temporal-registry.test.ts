import assert from "node:assert/strict";
import test from "node:test";

import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";
import { validateBusinessTemporalRegistry } from "./check-business-temporal-registry";

const model = (...fields: string[]) => new Set(fields);

test("registry validation fails closed for missing resources, models and projection provenance", () => {
  const registration = defineBusinessTemporalRegistration({
    key: "capital.ownership",
    ownerModuleKey: "capitalSecurities",
    resourceKey: "capitalSecurities.investors",
    aggregate: "Ownership",
    maturity: "partial",
    records: {
      authority: [{
        kind: "model",
        model: "ShareCapitalEvent",
        fields: ["id"],
        role: "event",
      }],
      supplementary: [{
        kind: "model",
        model: "OwnershipInterest",
        fields: ["id"],
        role: "projection",
      }],
    },
    commands: ["append-event"],
    ui: { asOf: "required", upcoming: true, history: true, recordState: true, sourceNavigation: true },
    projection: { eventSource: "ShareCapitalEvent", projection: "OwnershipInterest", sourceEventField: "sourceEventId", generationField: "projectionGeneration", runModel: "OwnershipProjectionRun", projectorKey: "capital.ownership", projectorVersion: 1, rebuildAdapterKey: "capital.rebuild" },
    policy: { storage: "event-projection", granularity: "date", futureChanges: "allow", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", revision: "reverse", deletion: "never" },
  });
  const result = validateBusinessTemporalRegistry({
    registrations: [registration],
    models: new Map([
      ["ShareCapitalEvent", model("id")],
      ["OwnershipInterest", model("id")],
    ]),
    resourceKeys: new Set(),
    repositoryRoot: "/workspace",
  });
  assert.match(result.errors.join("\n"), /resourceKey/);
  assert.match(result.errors.join("\n"), /sourceEventId/);
  assert.match(result.errors.join("\n"), /projectionGeneration/);
});

test("planned projections can register target provenance before structural migration", () => {
  const registration = defineBusinessTemporalRegistration({
    key: "capital.planned-ownership",
    ownerModuleKey: "capitalSecurities",
    resourceKey: "capitalSecurities.investors",
    aggregate: "Ownership",
    maturity: "planned",
    records: {
      authority: [{
        kind: "model",
        model: "ShareCapitalEvent",
        fields: ["id"],
        role: "event",
      }],
      supplementary: [{
        kind: "model",
        model: "OwnershipInterest",
        fields: ["id"],
        role: "projection",
      }],
    },
    commands: ["append-event"],
    ui: { asOf: "required", upcoming: true, history: true, recordState: true, sourceNavigation: true },
    projection: { eventSource: "ShareCapitalEvent", projection: "OwnershipInterest", sourceEventField: "sourceEventId", generationField: "projectionGeneration", runModel: "OwnershipProjectionRun", projectorKey: "capital.ownership", projectorVersion: 1, rebuildAdapterKey: "capital.rebuild" },
    policy: { storage: "event-projection", granularity: "date", futureChanges: "allow", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", revision: "reverse", deletion: "never" },
  });
  const result = validateBusinessTemporalRegistry({
    registrations: [registration],
    models: new Map([
      ["ShareCapitalEvent", model("id")],
      ["OwnershipInterest", model("id")],
    ]),
    resourceKeys: new Set(["capitalSecurities.investors"]),
    repositoryRoot: "/workspace",
  });
  assert.equal(result.errors.some((error) => error.includes("sourceEventId")), false);
});

test("registry validation rejects declared record views that bypass the standard factory or binding", () => {
  const registration = defineBusinessTemporalRegistration({
    key: "hr.employee.employment-fixture",
    ownerModuleKey: "hr",
    resourceKey: "hr.roster",
    aggregate: "EmploymentFixture",
    maturity: "partial",
    records: {
      authority: [{ kind: "model", model: "Employment", fields: ["id"], role: "period" }],
    },
    commands: ["change"],
    ui: {
      asOf: "required",
      upcoming: true,
      history: true,
      recordState: false,
      sourceNavigation: false,
      recordView: {
        presentation: "expandable-record-list",
        modulePath: "packages/hr/ui/EmploymentFixture.tsx",
        registrationBinding: "HR_EMPLOYMENT_FIXTURE_TEMPORAL",
      },
    },
    policy: { storage: "effective-version", granularity: "date", futureChanges: "allow", sameDayChanges: "single", overlaps: "forbid", gaps: "allow", revision: "audited-overwrite", deletion: "end-date" },
  });
  const result = validateBusinessTemporalRegistry({
    registrations: [registration],
    models: new Map([["Employment", model("id")]]),
    resourceKeys: new Set(["hr.roster"]),
    repositoryRoot: "/workspace",
    fileExists: () => true,
    readFile: () => "createBusinessTemporalRecordSections({ registration: SOME_OTHER_TEMPORAL })",
  });
  assert.match(result.errors.join("\n"), /未绑定 HR_EMPLOYMENT_FIXTURE_TEMPORAL/);
});

test("registry validation rejects a second stacked view beside the standard expandable record list", () => {
  const registration = defineBusinessTemporalRegistration({
    key: "hr.employee.agreement-fixture",
    ownerModuleKey: "hr",
    resourceKey: "hr.roster",
    aggregate: "AgreementFixture",
    maturity: "partial",
    records: {
      authority: [{ kind: "model", model: "EmploymentAgreement", fields: ["id"], role: "anchor" }],
    },
    commands: ["change"],
    ui: {
      asOf: "required",
      upcoming: true,
      history: true,
      recordState: false,
      sourceNavigation: false,
      recordView: {
        presentation: "expandable-record-list",
        modulePath: "packages/hr/ui/AgreementFixture.tsx",
        registrationBinding: "HR_AGREEMENT_FIXTURE_TEMPORAL",
      },
    },
    policy: { storage: "effective-version", granularity: "date", futureChanges: "allow", sameDayChanges: "single", overlaps: "allow", gaps: "allow", revision: "supersede", deletion: "never" },
  });
  const result = validateBusinessTemporalRegistry({
    registrations: [registration],
    models: new Map([["EmploymentAgreement", model("id")]]),
    resourceKeys: new Set(["hr.roster"]),
    repositoryRoot: "/workspace",
    fileExists: () => true,
    readFile: () => `
      createBusinessTemporalRecordSections({ registration: HR_AGREEMENT_FIXTURE_TEMPORAL });
      createLegacyStack({ registration: HR_AGREEMENT_FIXTURE_TEMPORAL });
    `,
  });
  assert.match(result.errors.join("\n"), /必须只保留标准展开行/);
});
