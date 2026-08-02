import assert from "node:assert/strict";
import test from "node:test";
import { assetViewLabel, assetViewShowsCompanyFilter, isAssetView } from "./asset-client-model";
import { assetLocationFromSearch, assetLocationSearch } from "./asset-location";

test("asset view model accepts and labels only registered workspace views", () => {
  assert.deepEqual(["cards", "policies", "period", "adjustments"].map(isAssetView), [true, true, true, true]);
  assert.equal(isAssetView("reconciliation"), false);
  assert.equal(assetViewLabel("period"), "本期折旧摊销");
  assert.equal(assetViewLabel("adjustments"), "减值与处置");
});

test("group accounting policy does not expose a company selector", () => {
  assert.equal(assetViewShowsCompanyFilter("policies", "group"), false);
  assert.equal(assetViewShowsCompanyFilter("policies", "company"), true);
  assert.equal(assetViewShowsCompanyFilter("cards", "group"), true);
});

test("asset deep links accept only authorized views and exact scopes", () => {
  const allowed = ["cards", "period"] as const;
  const accepted = assetLocationFromSearch("?view=period&companyCode=ZX02&year=2026&month=6", [...allowed]);
  assert.deepEqual(accepted, { view: "period", policyScope: null, companyCode: "ZX02", year: 2026, month: 6 });
  const denied = assetLocationFromSearch("?view=adjustments&companyCode=ZX02&year=x&month=15", [...allowed]);
  assert.deepEqual(denied, { view: null, policyScope: null, companyCode: "ZX02", year: null, month: null });
});

test("asset tab history retains the selected accounting scope", () => {
  assert.equal(assetLocationSearch({ view: "period", companyCode: "ZX02", year: "2026", month: "6" }), "?view=period&companyCode=ZX02&year=2026&month=6");
  assert.equal(assetLocationSearch({ view: "policies", policyScope: "company", companyCode: "ZX02", year: "2026", month: "6" }), "?view=policies&policyScope=company&companyCode=ZX02&year=2026&month=6");
});
