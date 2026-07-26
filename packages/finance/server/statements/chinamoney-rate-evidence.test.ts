import assert from "node:assert/strict";
import test from "node:test";

import {
  chinaMoneyHistorySourceCoversTargetDate,
  isSameChinaMoneyRateEvidence,
} from "./chinamoney-rate-evidence";

const stored = {
  rate: { toFixed: (decimalPlaces: number) => (5.1142).toFixed(decimalPlaces) },
  sourceName: "中国外汇交易中心",
  sourceField: "CAD/CNY 人民币汇率中间价（每 1 CAD）",
  publishedAt: new Date("2025-12-31T01:15:00.000Z"),
  note: "原始报价 CAD/CNY=5.1142；系统归一化为 1 CAD=5.1142 CNY",
};

test("treats the same official rate as idempotent across capture URLs and times", () => {
  assert.equal(isSameChinaMoneyRateEvidence(stored, {
    rate: 5.1142,
    sourceName: stored.sourceName,
    sourceField: stored.sourceField,
    publishedAt: stored.publishedAt,
    note: stored.note,
  }), true);
});

test("detects a corrected official rate for the same date", () => {
  assert.equal(isSameChinaMoneyRateEvidence(stored, {
    rate: 5.1143,
    sourceName: stored.sourceName,
    sourceField: stored.sourceField,
    publishedAt: stored.publishedAt,
    note: "原始报价 CAD/CNY=5.1143；系统归一化为 1 CAD=5.1143 CNY",
  }), false);
});

test("reuses a historical quote only when its source query covered the same target date", () => {
  const sourceUrl = "https://www.chinamoney.com.cn/history?startDate=2025-12-01&endDate=2025-12-31&currency=CAD%2FCNY";
  assert.equal(chinaMoneyHistorySourceCoversTargetDate(sourceUrl, "2025-12-31"), true);
  assert.equal(chinaMoneyHistorySourceCoversTargetDate(sourceUrl, "2025-12-30"), false);
  assert.equal(chinaMoneyHistorySourceCoversTargetDate("not a url", "2025-12-31"), false);
});
