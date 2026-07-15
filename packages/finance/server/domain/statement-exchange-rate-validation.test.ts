import assert from "node:assert/strict";
import test from "node:test";

import type { StatementExchangeRateInput } from "@workspace/finance/types";
import { buildSaveStatementExchangeRateCommand } from "./statement-exchange-rate-validation";

const input = {
  baseCurrency: "CAD" as const,
  quoteCurrency: "CNY" as const,
  rateKind: "closing" as const,
  rateDate: "2026-12-31",
  rate: 532,
  sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
  publishedAt: "2026-12-31T10:00:00+08:00",
  status: "draft" as const,
  note: "人工核对中行折算价",
};

test("exchange-rate save always persists a draft", () => {
  const draft = buildSaveStatementExchangeRateCommand(input, 9);
  assert.equal(draft.ok, true);
});

test("exchange-rate save cannot bypass independent review", () => {
  const verified = buildSaveStatementExchangeRateCommand({ ...input, status: "verified" }, 9);
  assert.equal(verified.ok, false);
  if (verified.ok) return;
  assert.match(verified.issue.message, /另一名人员/);
});

test("exchange-rate save rejects period-average rates under the confirmed policy", () => {
  const average = buildSaveStatementExchangeRateCommand({
    ...input,
    rateKind: "average",
  } as unknown as StatementExchangeRateInput, 9);
  assert.equal(average.ok, false);
  if (average.ok) return;
  assert.equal(average.issue.field, "rateKind");
});
