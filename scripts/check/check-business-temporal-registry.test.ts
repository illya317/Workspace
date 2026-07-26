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
    policy: { storage: "event-projection", granularity: "date", futureChanges: "allow", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", correction: "reverse", deletion: "never" },
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
    policy: { storage: "event-projection", granularity: "date", futureChanges: "allow", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", correction: "reverse", deletion: "never" },
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
