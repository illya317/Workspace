import assert from "node:assert/strict";
import test from "node:test";

import {
  repairFinanceReviewedOriginMappings,
  validateFinanceReviewedOriginMappingRepairInput,
} from "./repair-finance-reviewed-origin-mappings.mjs";

const repairRows = [{
  groupAccountId: 3673,
  companyCode: "02",
  sourceScopeKey: "T6::007",
  localAccountCode: "100203",
}];

test("finance reviewed-origin repair input pins the exact origin mapping list", () => {
  assert.deepEqual(validateFinanceReviewedOriginMappingRepairInput({
    schemaVersion: 1,
    kind: "finance-reviewed-origin-mapping-repair",
    policyVersionId: 7,
    rows: repairRows,
  }), {
    schemaVersion: 1,
    kind: "finance-reviewed-origin-mapping-repair",
    policyVersionId: 7,
    rows: repairRows,
  });
  assert.throws(() => validateFinanceReviewedOriginMappingRepairInput({
    schemaVersion: 1,
    kind: "finance-reviewed-origin-mapping-repair",
    policyVersionId: 7,
    rows: repairRows,
    sql: "UPDATE anything",
  }), /invalid/);
});

test("finance reviewed-origin repair verifies candidates and commits the exact suggested subset", async () => {
  const statements = [];
  const client = {
    query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes("count(*)::int")) {
        return { rows: [{ candidateCount: 247, suggestedCount: 243 }] };
      }
      if (sql.includes("UPDATE \"FinanceGroupAccountMapping\"")) return { rowCount: 243 };
      return { rows: [], rowCount: null };
    },
  };

  assert.deepEqual(await repairFinanceReviewedOriginMappings(client, {
    policyVersionId: 7,
    rows: Array.from({ length: 247 }, (_, index) => ({ ...repairRows[0], groupAccountId: 3673 + index })),
  }), {
    candidateCount: 247,
    updatedCount: 243,
    alreadyConfirmedCount: 4,
  });
  assert.equal(statements[0].sql, "BEGIN");
  assert.equal(statements.at(-1).sql, "COMMIT");
  assert.ok(statements.some((statement) => statement.sql.includes("mapping.\"mappingMethod\" = 'suggested'")));
});

test("finance reviewed-origin repair rolls back when the private expected count differs", async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.includes("count(*)::int")) {
        return { rows: [{ candidateCount: 246, suggestedCount: 246 }] };
      }
      return { rows: [], rowCount: null };
    },
  };

  await assert.rejects(() => repairFinanceReviewedOriginMappings(client, {
    policyVersionId: 7,
    rows: Array.from({ length: 247 }, (_, index) => ({ ...repairRows[0], groupAccountId: 3673 + index })),
  }), /expected 247/);
  assert.equal(statements.at(-1), "ROLLBACK");
});
