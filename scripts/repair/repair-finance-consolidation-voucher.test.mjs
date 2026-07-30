import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFinanceConsolidationVoucher,
  validateFinanceConsolidationVoucherInput,
} from "./repair-finance-consolidation-voucher.mjs";

function input() {
  return {
    schemaVersion: 1,
    kind: "finance-consolidation-voucher",
    voucher: {
      sourceKey: "canada-capital-historical-v1",
      voucherNo: "2019-05-合-0001",
      date: "2019-05-31",
      companyCode: "01",
      description: "加拿大公司设立投资历史调整",
      expectedPeriodSourceKey: "UFDATA_001_2019:5",
      evidence: {
        amountCny: 505_056,
        investmentRecognitionDate: "2019-05-31",
        matching: {
          label: "加拿大公司实收资本",
          companyCode: "05",
          lineCode: "paidInCapital",
          currencyCode: "CAD",
          originalAmount: 100_000,
          historicalRate: 5.05056,
        },
      },
      items: [{
        accountCode: "1511",
        accountName: "长期股权投资",
        category: "asset",
        balanceDirection: "debit",
        sourceSystem: "T6",
        sourceLedger: "001",
        sourceDatabase: "UFDATA_001_2019",
        debit: 505_056,
        credit: 0,
        description: "长期股权投资—加拿大公司",
        relatedEntity: "加拿大公司",
      }, {
        accountCode: "224101",
        accountName: "其他应付款-单位",
        category: "liability",
        balanceDirection: "credit",
        sourceSystem: "T6",
        sourceLedger: "001",
        sourceDatabase: "UFDATA_001_2019",
        debit: 0,
        credit: 505_056,
        description: "其他应付款—丰华制药",
        relatedEntity: "丰华制药",
        auxiliary: {
          dimensionType: "supplier",
          linkedCompanyCode: "04",
          sourceCode: "04",
          sourceLedger: "001",
          sourceName: "丰华制药",
          sourceRole: "supplier",
        },
      }],
    },
  };
}

test("finance consolidation voucher input pins a balanced voucher and counterparty", () => {
  assert.deepEqual(validateFinanceConsolidationVoucherInput(input()), input());
  assert.throws(() => validateFinanceConsolidationVoucherInput({
    ...input(),
    voucher: { ...input().voucher, sql: "INSERT INTO anything" },
  }), /fields are invalid/);
  const unbalanced = input();
  unbalanced.voucher.items[1].credit = 505_055;
  assert.throws(() => validateFinanceConsolidationVoucherInput(unbalanced), /must balance/);
});

test("finance consolidation voucher creates exact posted lines and the linked counterparty", async () => {
  const statements = [];
  const client = {
    query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes('SELECT id, "sourceKey" FROM "FinancePeriod"')) {
        return { rows: [{ id: 1403, sourceKey: "UFDATA_001_2019:5" }] };
      }
      if (sql.includes('FROM "FinanceAccount"')) {
        return { rows: [{
          id: 31996, code: "1511", name: "长期股权投资", category: "asset", balanceDirection: "debit",
          sourceSystem: "T6", sourceLedger: "001", sourceDatabase: "UFDATA_001_2019",
        }, {
          id: 32092, code: "224101", name: "其他应付款-单位", category: "liability", balanceDirection: "credit",
          sourceSystem: "T6", sourceLedger: "001", sourceDatabase: "UFDATA_001_2019",
        }] };
      }
      if (sql.includes('FROM "Company" AS company')) return { rows: [{ id: 11, code: "04", name: "丰华制药" }] };
      if (sql.includes('FROM "FinanceVoucher" AS voucher')) return { rows: [] };
      if (sql.includes('SELECT id FROM "FinanceVoucher"')) return { rows: [] };
      if (sql.includes('FROM "FinanceAuxiliaryMember"')) return { rows: [] };
      if (sql.includes('INSERT INTO "FinanceAuxiliaryMember"')) return { rows: [{ id: 901 }] };
      if (sql.includes('INSERT INTO "FinanceVoucher"')) return { rows: [{ id: 902 }] };
      if (sql.includes('INSERT INTO "FinanceVoucherItem"')) {
        return { rows: [{ id: statements.filter((item) => item.sql.includes('INSERT INTO "FinanceVoucherItem"')).length + 902 }] };
      }
      return { rows: [], rowCount: null };
    },
  };

  assert.deepEqual(await applyFinanceConsolidationVoucher(client, input()), {
    createdCount: 1,
    alreadyAppliedCount: 0,
    voucherId: 902,
  });
  assert.equal(statements[0].sql, "BEGIN");
  assert.equal(statements.at(-1).sql, "COMMIT");
  const voucherInsert = statements.find((statement) => statement.sql.includes('INSERT INTO "FinanceVoucher"'));
  assert.deepEqual(voucherInsert.parameters.slice(0, 6), [
    "2019-05-合-0001",
    "2019-05-31",
    1403,
    "加拿大公司设立投资历史调整",
    505_056,
    "01",
  ]);
  const auxiliaryLink = statements.find((statement) => statement.sql.includes('INSERT INTO "FinanceVoucherItemAuxiliary"'));
  assert.deepEqual(auxiliaryLink.parameters, [904, 901, "supplier"]);
});

test("finance consolidation voucher rolls back when an account expectation drifts", async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.includes('SELECT id, "sourceKey" FROM "FinancePeriod"')) {
        return { rows: [{ id: 1403, sourceKey: "UFDATA_001_2019:5" }] };
      }
      if (sql.includes('FROM "FinanceAccount"')) return { rows: [] };
      return { rows: [] };
    },
  };

  await assert.rejects(() => applyFinanceConsolidationVoucher(client, input()), /account 01:2019:1511 differs/);
  assert.equal(statements.at(-1), "ROLLBACK");
});
