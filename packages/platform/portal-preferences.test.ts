import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PINNED_PORTAL_SLOTS,
  MAX_PRIMARY_PORTAL_SLOTS,
  MAX_PORTAL_SLOTS,
  defaultPortalSlots,
  effectivePortalSlots,
  normalizePortalSlots,
  portalSlotEntries,
  type PortalEntry,
} from "./portal-preferences";

const entries: PortalEntry[] = [
  { key: "work", label: "工作", href: "/work", level: 1 },
  { key: "hr", label: "人事", href: "/hr", level: 1 },
  { key: "admin", label: "行政", href: "/admin", level: 1 },
  { key: "quality", label: "质量", href: "/quality", level: 1 },
  { key: "work.plan", label: "工作计划", href: "/work/plan", level: 2, parentKey: "work", parentLabel: "工作" },
  { key: "hr.performance", label: "绩效管理", href: "/hr/performance", level: 2, parentKey: "hr", parentLabel: "人事" },
];

const validKeys = new Set(entries.map((entry) => entry.key));

test("previous 9+2 preferences migrate to 13+2 without turning shortcuts into cards", () => {
  const normalized = normalizePortalSlots([
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: false },
    { key: "hr", pinned: false },
    ...Array.from({ length: 6 }, () => ({ key: null, pinned: false })),
    { key: "hr.performance", pinned: true },
    { key: "admin", pinned: true },
  ], validKeys);

  assert.equal(normalized.length, MAX_PORTAL_SLOTS);
  assert.deepEqual(normalized.slice(0, MAX_PRIMARY_PORTAL_SLOTS).map((slot) => slot.key), [
    "quality", "work.plan", "hr", null, null, null, null, null, null, null, null, null, null,
  ]);
  assert.deepEqual(normalized.slice(MAX_PRIMARY_PORTAL_SLOTS).map((slot) => slot.key), ["hr.performance", "admin"]);
});

test("legacy embedded shortcuts remain cards and also migrate into the two shortcut positions", () => {
  const normalized = normalizePortalSlots([
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: true },
    { key: "hr", pinned: false },
    { key: "hr.performance", pinned: true },
  ], validKeys);

  assert.deepEqual(normalized.slice(0, 4).map((slot) => slot.key), ["quality", "work.plan", "hr", "hr.performance"]);
  assert.deepEqual(normalized.slice(-MAX_PINNED_PORTAL_SLOTS).map((slot) => slot.key), ["work.plan", "hr.performance"]);
});

test("personalized desktop contains only selected card positions", () => {
  const configured = normalizePortalSlots([
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: false },
    ...Array.from({ length: 10 }, () => ({ key: null, pinned: false })),
    { key: "work.plan", pinned: true },
    { key: "admin", pinned: true },
  ], validKeys);
  const cards = portalSlotEntries(effectivePortalSlots(configured, entries), entries);

  assert.deepEqual(cards.map(({ entry }) => entry.key), ["quality", "work.plan"]);
  assert.deepEqual(cards.filter(({ slot }) => slot.pinned).map(({ entry }) => entry.key), ["work.plan"]);
});

test("default configuration contains at most thirteen L1 cards and two shortcuts", () => {
  const manyEntries: PortalEntry[] = [
    ...Array.from({ length: 15 }, (_, index): PortalEntry => ({
      key: `module-${index + 1}`,
      label: `模块 ${index + 1}`,
      href: `/module-${index + 1}`,
      level: 1,
    })),
    { key: "module-1.child", label: "子入口", href: "/module-1/child", level: 2, parentKey: "module-1", parentLabel: "模块 1" },
  ];
  const defaults = defaultPortalSlots(manyEntries);

  assert.equal(defaults.length, MAX_PORTAL_SLOTS);
  assert.deepEqual(
    defaults.slice(0, MAX_PRIMARY_PORTAL_SLOTS).map((slot) => slot.key),
    manyEntries.slice(0, MAX_PRIMARY_PORTAL_SLOTS).map((entry) => entry.key),
  );
  assert.deepEqual(defaults.slice(MAX_PRIMARY_PORTAL_SLOTS).map((slot) => slot.key), ["module-1", "module-2"]);
  assert.ok(defaults.every((slot) => slot.key !== "module-1.child"));
});
