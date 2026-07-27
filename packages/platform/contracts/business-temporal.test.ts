import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessTemporalContractError,
  businessDateWindowContains,
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  businessTemporalViewKind,
  classifyInclusiveBusinessPeriod,
  createBusinessTemporalCatalog,
  defineBusinessTemporalModule,
  defineBusinessTemporalRegistration,
  exclusiveEndToInclusiveThrough,
  inclusiveBusinessPeriodToWindow,
  inclusiveBusinessPeriodContains,
  inclusiveThroughToExclusive,
  LATEST_INCLUSIVE_BUSINESS_DATE,
  parseBusinessDate,
  shiftBusinessDate,
  type BusinessTemporalCommitRequest,
  type BusinessTemporalPreviewRequest,
} from "./business-temporal";

test("business dates reject normalized-but-impossible calendar values", () => {
  assert.equal(parseBusinessDate("2028-02-29"), "2028-02-29");
  assert.equal(parseBusinessDate("2027-02-29"), null);
  assert.equal(parseBusinessDate("0000-01-01"), null);
  assert.equal(parseBusinessDate("2026-07-26T00:00:00Z"), null);
});

test("inclusive periods preserve D and close the preceding period on D minus one", () => {
  const period = { validFrom: "2026-08-01", validThrough: "2026-08-31" };
  assert.equal(inclusiveBusinessPeriodContains(period, "2026-07-31"), false);
  assert.equal(inclusiveBusinessPeriodContains(period, "2026-08-01"), true);
  assert.equal(inclusiveBusinessPeriodContains(period, "2026-08-31"), true);
  assert.equal(inclusiveBusinessPeriodContains(period, "2026-09-01"), false);
  assert.equal(shiftBusinessDate("2026-08-01", -1), "2026-07-31");
  assert.equal(shiftBusinessDate("2028-03-01", -1), "2028-02-29");
  assert.equal(inclusiveThroughToExclusive("2026-12-31"), "2027-01-01");
  assert.equal(inclusiveThroughToExclusive(LATEST_INCLUSIVE_BUSINESS_DATE), "9999-12-31");
  assert.equal(exclusiveEndToInclusiveThrough("2027-01-01"), "2026-12-31");
  assert.deepEqual(inclusiveBusinessPeriodToWindow(period), {
    validFrom: "2026-08-01",
    validToExclusive: "2026-09-01",
  });
});

test("canonical half-open windows make adjacent periods non-overlapping", () => {
  const left = { validFrom: "2026-01-01", validToExclusive: "2026-08-01" };
  const right = { validFrom: "2026-08-01", validToExclusive: null };
  assert.equal(businessDateWindowContains(left, "2026-07-31"), true);
  assert.equal(businessDateWindowContains(left, "2026-08-01"), false);
  assert.equal(businessDateWindowsOverlap(left, right), false);
  assert.equal(businessDateWindowsOverlap(left, { validFrom: "2026-07-31" }), true);
  assert.throws(
    () => businessDateWindowsOverlap(
      { validFrom: "2026-08-01", validToExclusive: "2026-08-01" },
      right,
    ),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_INVALID_PERIOD",
  );
});

test("period classification separates upcoming, current, past and invalid data", () => {
  assert.equal(classifyInclusiveBusinessPeriod({ validFrom: "2026-08-01" }, "2026-07-26"), "upcoming");
  assert.equal(classifyInclusiveBusinessPeriod({ validFrom: "2026-01-01" }, "2026-07-26"), "current");
  assert.equal(classifyInclusiveBusinessPeriod({ validThrough: "2026-07-25" }, "2026-07-26"), "past");
  assert.equal(classifyInclusiveBusinessPeriod({}, "2026-07-26"), "current");
  assert.equal(classifyInclusiveBusinessPeriod({ validFrom: "2026-09-01", validThrough: "2026-08-01" }, "2026-07-26"), "invalid");
  assert.equal(classifyInclusiveBusinessPeriod({ validFrom: "bad-date" }, "2026-07-26"), "invalid");
  assert.equal(classifyInclusiveBusinessPeriod({ validThrough: "9999-12-31" }, "2026-07-26"), "invalid");
});

test("the policy catalog is deterministic and rejects duplicate registrations", () => {
  const employment = defineBusinessTemporalRegistration({
    key: "hr.employee.employment",
    ownerModuleKey: "hr",
    resourceKey: "hr.roster",
    aggregate: "EmployeeEmployment",
    maturity: "partial",
    records: {
      authority: [{
        kind: "model",
        model: "Employment",
        fields: ["id", "employeeId", "joinDate", "leaveDate"],
        role: "period",
      }],
      supplementary: [{
        kind: "model",
        model: "EmployeeLifecycleEvent",
        fields: ["id", "employeeId", "effectiveDate"],
        role: "event",
      }],
    },
    commands: ["schedule", "correct", "end-date", "cancel-future"],
    ui: {
      asOf: "required",
      upcoming: true,
      history: true,
      recordState: true,
      sourceNavigation: false,
    },
    policy: {
      storage: "effective-version",
      granularity: "date",
      futureChanges: "allow",
      sameDayChanges: "single",
      overlaps: "forbid",
      gaps: "allow",
      revision: "audited-overwrite",
      deletion: "end-date",
    },
  });
  const catalog = createBusinessTemporalCatalog([employment]);
  assert.deepEqual(catalog.keys(), ["hr.employee.employment"]);
  assert.equal(catalog.require("hr.employee.employment"), employment);
  assert.equal(businessTemporalViewKind(employment.policy.storage), "effective-period");
  assert.equal(businessTemporalRetrospectiveChanges(employment.policy), "allow");
  assert.deepEqual([
    businessTemporalViewKind("current"),
    businessTemporalViewKind("date-enabled"),
    businessTemporalViewKind("effective-version"),
    businessTemporalViewKind("revision"),
    businessTemporalViewKind("event-projection"),
  ], ["current-audit", "availability", "effective-period", "revision", "event-ledger"]);
  assert.throws(
    () => createBusinessTemporalCatalog([employment, employment]),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_DUPLICATE_POLICY",
  );
  assert.throws(
    () => catalog.require("missing"),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_POLICY_NOT_FOUND",
  );
});

test("registrations fail closed when storage, UI and projection capabilities disagree", () => {
  assert.throws(
    () => defineBusinessTemporalRegistration({
      key: "hr.read-only-period",
      ownerModuleKey: "hr",
      resourceKey: "hr.roster",
      aggregate: "ReadOnlyPeriod",
      maturity: "partial",
      records: {
        authority: [{ kind: "model", model: "ReadOnlyPeriod", fields: ["id"], role: "period" }],
      },
      commands: ["correct"],
      ui: {
        asOf: "required",
        upcoming: true,
        history: true,
        recordState: true,
        sourceNavigation: false,
      },
      policy: {
        storage: "effective-version",
        granularity: "date",
        futureChanges: "allow",
        sameDayChanges: "single",
        overlaps: "forbid",
        gaps: "allow",
        revision: "forbid",
        deletion: "never",
      },
    }),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_INVALID_POLICY",
  );

  assert.throws(
    () => defineBusinessTemporalRegistration({
      key: "finance.policy",
      ownerModuleKey: "finance",
      resourceKey: "finance.ledger",
      aggregate: "FinancePolicy",
      maturity: "implemented",
      records: {
        authority: [{
          kind: "model",
          model: "FinanceAccountingPolicyVersion",
          fields: ["id", "version"],
          role: "revision",
        }],
      },
      commands: ["publish"],
      ui: {
        asOf: "hidden",
        upcoming: false,
        history: true,
        recordState: true,
        sourceNavigation: false,
      },
      policy: {
        storage: "revision",
        granularity: "date",
        futureChanges: "allow",
        sameDayChanges: "single",
        overlaps: "forbid",
        gaps: "allow",
        revision: "supersede",
        deletion: "draft-only",
      },
    }),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_INVALID_POLICY",
  );

  assert.throws(
    () => defineBusinessTemporalRegistration({
      key: "capital.ownership",
      ownerModuleKey: "capitalSecurities",
      resourceKey: "capitalSecurities.investors",
      aggregate: "OwnershipLedger",
      maturity: "partial",
      records: {
        authority: [{
          kind: "model",
          model: "ShareCapitalEvent",
          fields: ["id", "sequence"],
          role: "event",
        }],
      },
      commands: ["reverse"],
      ui: {
        asOf: "required",
        upcoming: true,
        history: true,
        recordState: true,
        sourceNavigation: true,
      },
      projection: {
        eventSource: "ShareCapitalEvent",
        projection: "OwnershipInterest",
        sourceEventField: "sourceEventId",
        generationField: "projectionGeneration",
        runModel: "OwnershipProjectionRun",
        projectorKey: "capital.ownership",
        projectorVersion: 1,
        rebuildAdapterKey: "capital.rebuildOwnershipProjection",
      },
      policy: {
        storage: "event-projection",
        granularity: "date",
        futureChanges: "allow",
        sameDayChanges: "sequenced",
        overlaps: "forbid",
        gaps: "allow",
        revision: "reverse",
        deletion: "never",
      },
    }),
    (error) => error instanceof BusinessTemporalContractError && error.code === "TEMPORAL_INVALID_POLICY",
  );
});

test("a runtime module binds one registration to one narrow domain adapter", async () => {
  const registration = defineBusinessTemporalRegistration({
    key: "library.document-version",
    ownerModuleKey: "library",
    resourceKey: "library.basicInfo",
    aggregate: "LibraryDocument",
    maturity: "implemented",
    implementation: {
      adapterKey: "library.document-version",
      modulePath: "packages/library/server/document-versions.ts",
    },
    records: {
      authority: [
        { kind: "model", model: "LibraryDocument", fields: ["id"], role: "anchor" },
        { kind: "model", model: "LibraryDocumentVersion", fields: ["id", "version"], role: "revision" },
      ],
    },
    commands: ["publish", "supersede"],
    ui: {
      asOf: "hidden",
      upcoming: false,
      history: true,
      recordState: true,
      sourceNavigation: true,
    },
    policy: {
      storage: "revision",
      granularity: "instant",
      futureChanges: "forbid",
      sameDayChanges: "sequenced",
      overlaps: "forbid",
      gaps: "allow",
      revision: "supersede",
      deletion: "draft-only",
    },
  });
  type Subject = Record<string, never>;
  type Command = Record<string, never>;
  function execute(request: BusinessTemporalPreviewRequest<Subject, Command>): Promise<{ mode: "preview"; preview: { revision: number } }>;
  function execute(request: BusinessTemporalCommitRequest<Subject, Command>): Promise<{ mode: "commit"; result: { revision: number } }>;
  async function execute(request: BusinessTemporalPreviewRequest<Subject, Command> | BusinessTemporalCommitRequest<Subject, Command>) {
    return request.mode === "preview"
      ? { mode: "preview" as const, preview: { revision: 2 } }
      : { mode: "commit" as const, result: { revision: 2 } };
  }
  const adapter = {
    execute,
    async getState() {
      return { registrationKey: registration.key, asOf: "2026-07-27" as never, state: { revision: 1 } };
    },
    async getTimeline() {
      return { registrationKey: registration.key, items: [{ revision: 1 }] };
    },
  };
  const lifecycleModule = defineBusinessTemporalModule(registration, adapter);
  assert.equal(lifecycleModule.registration, registration);
  assert.deepEqual((await lifecycleModule.adapter.getState({}, { asOf: "2026-07-27" as never })).state, { revision: 1 });
});
