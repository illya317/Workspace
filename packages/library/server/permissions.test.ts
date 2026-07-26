import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibraryDocumentAccessPolicy,
  getLibrarySourceReadRequirement,
} from "./permissions";

test("authoritative Library sources map to their owning read resource", () => {
  assert.deepEqual(
    [
      "finance-report",
      "ownership-structure",
      "organization-chart",
      "roster-due-diligence",
      "contract-ledger",
    ].map((generatorKey) => [generatorKey, getLibrarySourceReadRequirement(generatorKey)]),
    [
      ["finance-report", "finance.statements"],
      ["ownership-structure", "capitalSecurities.investors"],
      ["organization-chart", "hr.roster"],
      ["roster-due-diligence", "hr.roster.generated"],
      ["contract-ledger", "administration.contracts"],
    ],
  );
});

test("document access requires Library visibility and the matching source read permission", () => {
  const policy = buildLibraryDocumentAccessPolicy(2, new Set([
    "finance.statements",
    "hr.roster.generated",
  ]));

  assert.equal(policy.allows({ confidentialityLevel: 2, generatorKey: "finance-report" }), true);
  assert.equal(policy.allows({ confidentialityLevel: 2, generatorKey: "roster-due-diligence" }), true);
  assert.equal(policy.allows({ confidentialityLevel: 2, generatorKey: "contract-ledger" }), false);
  assert.equal(policy.allows({ confidentialityLevel: 3, generatorKey: "finance-report" }), false);
  assert.equal(policy.allows({ confidentialityLevel: 2, generatorKey: null }), true);
  assert.equal(policy.allows({ confidentialityLevel: 2, generatorKey: "custom-generator" }), true);
  assert.deepEqual([...policy.deniedGeneratorKeys].sort(), [
    "contract-ledger",
    "organization-chart",
    "ownership-structure",
  ]);
});

test("a user without Library read permission cannot see any document", () => {
  const policy = buildLibraryDocumentAccessPolicy(0, new Set(["finance.statements"]));
  assert.equal(policy.allows({ confidentialityLevel: 1, generatorKey: null }), false);
  assert.deepEqual(policy.where, { id: -1 });
});
