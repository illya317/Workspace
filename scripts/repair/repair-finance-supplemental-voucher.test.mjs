import assert from "node:assert/strict";
import test from "node:test";

import {
  repairFinanceSupplementalVoucher,
  validateFinanceSupplementalVoucherInput,
} from "./repair-finance-supplemental-voucher.mjs";

const input = {
  schemaVersion: 1,
  kind: "finance-supplemental-voucher",
  releaseKey: "supplemental-voucher-2023-01-example-v1",
  actorUserId: 2,
  company: {
    code: "C01",
    name: "Example Company",
    identityNumber: "EXAMPLE-IDENTITY-001",
  },
  voucher: {
    voucherNo: "2023-01-EXAMPLE-0001",
    date: "2023-01-31",
    description: "Example historical supplement",
    counterpartyName: "Example Counterparty",
    currencyCode: "CNY",
    lines: [
      {
        accountCode: "1604",
        accountName: "Construction in progress",
        side: "debit",
        amount: "12345678.90",
        description: "Example historical supplement",
        relatedEntity: "Example Counterparty",
      },
      {
        accountCode: "2241",
        accountName: "Other payables",
        side: "credit",
        amount: "12345678.90",
        description: "Example historical supplement",
        relatedEntity: "Example Counterparty",
      },
    ],
  },
};

test("finance supplemental voucher input pins a balanced legal-entity and account payload", () => {
  assert.equal(validateFinanceSupplementalVoucherInput(input), input);
  assert.throws(() => validateFinanceSupplementalVoucherInput({
    ...input,
    sql: "INSERT INTO anything",
  }), /input is invalid/);
  assert.throws(() => validateFinanceSupplementalVoucherInput({
    ...input,
    voucher: {
      ...input.voucher,
      lines: input.voucher.lines.map((line, index) => index === 1 ? { ...line, amount: "1.00" } : line),
    },
  }), /must be balanced/);
  assert.throws(() => validateFinanceSupplementalVoucherInput({
    ...input,
    voucher: { ...input.voucher, date: "2023-02-31" },
  }), /date is invalid/);
});

function successfulClient() {
  const statements = [];
  const client = {
    query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes('SELECT "value" FROM "SystemConfig"')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM "User"')) return { rowCount: 1, rows: [{ id: 2 }] };
      if (sql.includes('FROM "Company" company')) return { rowCount: 1, rows: [{ id: 10, code: "C01" }] };
      if (sql.includes('FROM "FinancePeriod"')) {
        return { rowCount: 1, rows: [{ id: 20, startDate: "2023-01-01", endDate: "2023-01-31", isClosed: true }] };
      }
      if (sql.includes('FROM "FinanceAccount"')) {
        return {
          rowCount: 2,
          rows: [
            { id: 30, code: "1604", name: "Construction in progress", balanceDirection: "debit" },
            { id: 31, code: "2241", name: "Other payables", balanceDirection: "credit" },
          ],
        };
      }
      if (sql.includes('FROM "FinanceVoucher"')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO "FinanceVoucher"')) return { rowCount: 1, rows: [{ id: 40 }] };
      return { rowCount: 1, rows: [] };
    },
  };
  return { client, statements };
}

test("finance supplemental voucher writes a posted Workspace voucher and marker in one transaction", async () => {
  const { client, statements } = successfulClient();
  assert.deepEqual(await repairFinanceSupplementalVoucher(client, input), {
    voucherId: 40,
    total: "12345678.90",
    itemCount: 2,
    alreadyApplied: false,
  });
  assert.equal(statements[0].sql, "BEGIN");
  assert.equal(statements.at(-1).sql, "COMMIT");
  const voucherInsert = statements.find((statement) => statement.sql.includes('INSERT INTO "FinanceVoucher"'));
  assert.match(voucherInsert.sql, /'posted'/);
  assert.deepEqual(voucherInsert.parameters.slice(6, 11), [
    "WORKSPACE",
    "WORKSPACE",
    input.releaseKey,
    "SUPPLEMENTAL",
    "补录凭证",
  ]);
  const itemInserts = statements.filter((statement) => statement.sql.includes('INSERT INTO "FinanceVoucherItem"'));
  assert.equal(itemInserts.length, 2);
  assert.equal(itemInserts[0].parameters[5], "Example Counterparty");
  assert.equal(itemInserts[1].parameters[9], `${input.releaseKey}:line:2`);
  assert.ok(statements.some((statement) => statement.sql.includes('INSERT INTO "SystemConfig"')));
});

test("finance supplemental voucher rolls back instead of adopting an unmarked conflict", async () => {
  const { client, statements } = successfulClient();
  const originalQuery = client.query;
  client.query = async (sql, parameters) => {
    if (sql.includes('FROM "FinanceVoucher"')) {
      statements.push({ sql, parameters });
      return { rowCount: 1, rows: [{ id: 99 }] };
    }
    return originalQuery(sql, parameters);
  };
  await assert.rejects(() => repairFinanceSupplementalVoucher(client, input), /already exists without its data release marker/);
  assert.equal(statements.at(-1).sql, "ROLLBACK");
});
