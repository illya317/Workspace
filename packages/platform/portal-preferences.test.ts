import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("legacy nine-slot preferences migrate into card ordering and two mobile shortcuts", () => {
  const normalized = normalizePortalSlots([
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: true },
    { key: "hr", pinned: false },
    { key: "admin", pinned: false },
    { key: null, pinned: false },
    { key: "hr.performance", pinned: true },
    { key: "work", pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
  ], new Set(entries.map((entry) => entry.key)));

  assert.deepEqual(normalized, [
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: false },
    { key: "hr", pinned: false },
    { key: "admin", pinned: false },
    { key: "hr.performance", pinned: false },
    { key: "work", pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: "work.plan", pinned: true },
    { key: "hr.performance", pinned: true },
  ]);
});

test("configured positions order cards without hiding any accessible entry", () => {
  const configured = normalizePortalSlots([
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: "hr.performance", pinned: true },
    { key: "admin", pinned: true },
  ], new Set(entries.map((entry) => entry.key)));
  const cards = portalSlotEntries(effectivePortalSlots(configured, entries), entries);

  assert.deepEqual(cards.map(({ entry }) => entry.key), [
    "quality",
    "work.plan",
    "work",
    "hr",
    "admin",
    "hr.performance",
  ]);
  assert.deepEqual(cards.filter(({ slot }) => slot.pinned).map(({ entry }) => entry.key), [
    "admin",
    "hr.performance",
  ]);
  assert.equal(cards.length, entries.length);
});

test("default configuration defines nine ordering positions and two mobile shortcuts", () => {
  assert.deepEqual(defaultPortalSlots(entries), [
    { key: "work", pinned: false },
    { key: "hr", pinned: false },
    { key: "admin", pinned: false },
    { key: "quality", pinned: false },
    { key: "work.plan", pinned: false },
    { key: "hr.performance", pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: null, pinned: false },
    { key: "work", pinned: true },
    { key: "hr", pinned: true },
  ]);
  assert.equal(portalSlotEntries(effectivePortalSlots([], entries), entries).length, entries.length);
});
