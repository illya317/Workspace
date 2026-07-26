import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseGroupAccountMapping } from "./mapping-review";

const reference = (id: number, code: string, name: string, category = "expense") => ({
  id, code, name, category, balanceDirection: category === "liability" ? "credit" : "debit", sourceKind: "reference_seed" as const,
});

test("same code and name is trusted only when accounting attributes also match", () => {
  const exact = diagnoseGroupAccountMapping({
    localAccountCode: "660205",
    localAccountName: "办公费",
    localCategory: "expense",
    localBalanceDirection: "debit",
    mappingMethod: "exact_code_name",
    currentGroupAccount: reference(1, "660205", "办公费"),
    candidates: [],
  });
  assert.equal(exact.reviewClass, "confirmed");
  assert.equal(exact.needsReview, false);

  const conflict = diagnoseGroupAccountMapping({
    localAccountCode: "660205",
    localAccountName: "办公费",
    localCategory: "expense",
    localBalanceDirection: "debit",
    mappingMethod: "exact_code_name",
    currentGroupAccount: reference(1, "660205", "办公费", "asset"),
    candidates: [],
  });
  assert.equal(conflict.reviewClass, "pending_review");
});

test("a system suggestion becomes confirmed when code name and attributes are exact", () => {
  const result = diagnoseGroupAccountMapping({
    localAccountCode: "100204",
    localAccountName: "一般---建行大丰支行（加元）",
    localCategory: "asset",
    localBalanceDirection: "debit",
    mappingMethod: "suggested",
    currentGroupAccount: reference(1, "100204", "一般---建行大丰支行（加元）", "asset"),
    candidates: [],
  });
  assert.equal(result.reviewClass, "confirmed");
  assert.equal(result.needsReview, false);
});

test("unmatched provident-fund accounts suggest nearby compatible reference accounts", () => {
  const result = diagnoseGroupAccountMapping({
    localAccountCode: "5301010503",
    localAccountName: "住房公积金",
    localCategory: "cost",
    localBalanceDirection: "debit",
    mappingMethod: "unmatched",
    currentGroupAccount: null,
    candidates: [
      reference(1, "5301010803", "公积金", "cost"),
      reference(2, "66020103", "公积金", "expense"),
      reference(3, "22110306", "住房公积金", "liability"),
    ],
  });

  assert.equal(result.reviewClass, "pending_review");
  assert.deepEqual(result.suggestions.map((candidate) => candidate.code), ["5301010803"]);
});

test("same names never suggest a cross-category 1xxx to 6xxx mapping", () => {
  const current = reference(9, "1801010201", "办公费用", "asset");
  const result = diagnoseGroupAccountMapping({
    localAccountCode: "66020201",
    localAccountName: "办公费用",
    localCategory: "expense",
    localBalanceDirection: "debit",
    mappingMethod: "exact_name",
    currentGroupAccount: current,
    candidates: [current, reference(1, "660205", "办公费", "expense")],
  });

  assert.equal(result.reviewClass, "pending_review");
  assert.deepEqual(result.suggestions.map((candidate) => candidate.code), ["660205"]);
});

test("manual decisions remain reviewed instead of being re-scored", () => {
  const result = diagnoseGroupAccountMapping({
    localAccountCode: "222102",
    localAccountName: "应交增值税",
    localCategory: "liability",
    localBalanceDirection: "credit",
    mappingMethod: "manual_override",
    currentGroupAccount: reference(1, "222101", "应交增值税", "liability"),
    candidates: [],
  });

  assert.equal(result.reviewClass, "reviewed");
  assert.equal(result.needsReview, false);
});

test("manual decisions with incompatible accounting attributes return to review", () => {
  const result = diagnoseGroupAccountMapping({
    localAccountCode: "66020103",
    localAccountName: "住房公积金",
    localCategory: "expense",
    localBalanceDirection: "debit",
    mappingMethod: "manual_override",
    currentGroupAccount: reference(1, "22110306", "住房公积金", "liability"),
    candidates: [],
  });

  assert.equal(result.reviewClass, "pending_review");
  assert.equal(result.needsReview, true);
});
