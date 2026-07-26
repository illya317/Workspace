import type { ReactNode } from "react";

export const MAX_PRIMARY_PORTAL_SLOTS = 12;
export const MAX_PINNED_PORTAL_SLOTS = 2;
export const MAX_PORTAL_SLOTS = MAX_PRIMARY_PORTAL_SLOTS + MAX_PINNED_PORTAL_SLOTS;

const PREVIOUS_PRIMARY_PORTAL_SLOTS = 9;
const PREVIOUS_PORTAL_SLOTS = PREVIOUS_PRIMARY_PORTAL_SLOTS + MAX_PINNED_PORTAL_SLOTS;

export interface PortalSlot {
  key: string | null;
  pinned: boolean;
}

export interface PortalEntry {
  key: string;
  label: string;
  desc?: string;
  href: string;
  color?: string;
  icon?: ReactNode;
  level: 1 | 2;
  parentKey?: string;
  parentLabel?: string;
  resourceKey?: string;
}

export interface PortalModuleSource {
  key: string;
  label: string;
  desc?: string;
  href: string;
  color?: string;
  icon?: ReactNode;
  resourceKey?: string;
  children?: Array<{
    key: string;
    label: string;
    desc?: string;
    href: string;
    color?: string;
    icon?: ReactNode;
    resourceKey?: string;
  }>;
}

function normalizeSlotKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key || null;
}

export function portalEntriesFromModules(modules: readonly PortalModuleSource[]): PortalEntry[] {
  return modules.flatMap((module) => {
    const parent: PortalEntry = {
      key: module.key,
      label: module.label,
      desc: module.desc,
      href: module.href,
      color: module.color,
      icon: module.icon,
      level: 1,
      resourceKey: module.resourceKey,
    };
    const children = (module.children ?? []).map((child): PortalEntry => ({
      key: `${module.key}.${child.key}`,
      label: child.label,
      desc: child.desc,
      href: child.href,
      color: child.color ?? module.color,
      icon: child.icon,
      level: 2,
      parentKey: module.key,
      parentLabel: module.label,
      resourceKey: child.resourceKey,
    }));
    return [parent, ...children];
  });
}

export function normalizePortalSlots(value: unknown, validKeys?: ReadonlySet<string>): PortalSlot[] {
  const rawItems = Array.isArray(value) ? value : [];
  if (rawItems.length !== MAX_PORTAL_SLOTS) {
    return normalizeLegacyPortalSlots(rawItems, validKeys);
  }
  const seenPrimary = new Set<string>();
  const seenShortcuts = new Set<string>();
  const slots: PortalSlot[] = [];
  for (let index = 0; index < MAX_PORTAL_SLOTS; index += 1) {
    const item = rawItems[index];
    const rawKey = item && typeof item === "object" && "key" in item
      ? (item as { key?: unknown }).key
      : item;
    let key = normalizeSlotKey(rawKey);
    const pinned = index >= MAX_PRIMARY_PORTAL_SLOTS;
    const seen = pinned ? seenShortcuts : seenPrimary;
    if (key && (seen.has(key) || (validKeys && !validKeys.has(key)))) key = null;
    if (key) seen.add(key);
    slots.push({ key, pinned });
  }
  return slots;
}

function normalizeLegacyPortalSlots(rawItems: unknown[], validKeys?: ReadonlySet<string>): PortalSlot[] {
  const seenPrimary = new Set<string>();
  const seenShortcuts = new Set<string>();
  const primaryKeys: string[] = [];
  const shortcutKeys: string[] = [];
  const separatedGroups = rawItems.length === PREVIOUS_PORTAL_SLOTS;
  const primaryItems = separatedGroups ? rawItems.slice(0, PREVIOUS_PRIMARY_PORTAL_SLOTS) : rawItems;
  const shortcutItems = separatedGroups
    ? rawItems.slice(PREVIOUS_PRIMARY_PORTAL_SLOTS)
    : rawItems.filter((item) => Boolean(item && typeof item === "object" && "pinned" in item && (item as { pinned?: unknown }).pinned));
  for (const item of primaryItems) {
    const rawKey = item && typeof item === "object" && "key" in item
      ? (item as { key?: unknown }).key
      : item;
    const key = normalizeSlotKey(rawKey);
    if (!key || (validKeys && !validKeys.has(key))) continue;
    if (!seenPrimary.has(key) && primaryKeys.length < MAX_PRIMARY_PORTAL_SLOTS) {
      primaryKeys.push(key);
      seenPrimary.add(key);
    }
  }
  for (const item of shortcutItems) {
    const rawKey = item && typeof item === "object" && "key" in item
      ? (item as { key?: unknown }).key
      : item;
    const key = normalizeSlotKey(rawKey);
    if (!key || (validKeys && !validKeys.has(key))) continue;
    if (!seenShortcuts.has(key) && shortcutKeys.length < MAX_PINNED_PORTAL_SLOTS) {
      shortcutKeys.push(key);
      seenShortcuts.add(key);
    }
  }
  return [
    ...Array.from({ length: MAX_PRIMARY_PORTAL_SLOTS }, (_, index) => ({
      key: primaryKeys[index] ?? null,
      pinned: false,
    })),
    ...Array.from({ length: MAX_PINNED_PORTAL_SLOTS }, (_, index) => ({
      key: shortcutKeys[index] ?? null,
      pinned: true,
    })),
  ];
}

export function defaultPortalSlots(entries: readonly PortalEntry[]): PortalSlot[] {
  const preferred = entries.filter((entry) => entry.level === 1).slice(0, MAX_PRIMARY_PORTAL_SLOTS);
  const shortcuts = preferred.slice(0, MAX_PINNED_PORTAL_SLOTS);
  return [
    ...Array.from({ length: MAX_PRIMARY_PORTAL_SLOTS }, (_, index) => ({
      key: preferred[index]?.key ?? null,
      pinned: false,
    })),
    ...Array.from({ length: MAX_PINNED_PORTAL_SLOTS }, (_, index) => ({
      key: shortcuts[index]?.key ?? null,
      pinned: true,
    })),
  ];
}

export function configuredPortalSlots(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return normalizePortalSlots(slots, new Set(byKey.keys()));
}

export function effectivePortalSlots(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const normalized = configuredPortalSlots(slots, entries);
  const primaryKeys = normalized.slice(0, MAX_PRIMARY_PORTAL_SLOTS)
    .map((slot) => slot.key)
    .filter((key): key is string => Boolean(key));
  const shortcutKeys = normalized.slice(MAX_PRIMARY_PORTAL_SLOTS)
    .map((slot) => slot.key)
    .filter((key): key is string => Boolean(key));
  const shortcutKeySet = new Set(shortcutKeys);
  return primaryKeys.map((key) => ({
    key,
    pinned: shortcutKeySet.has(key),
  }));
}

export function portalSlotEntries(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return slots
    .map((slot) => slot.key ? { slot, entry: byKey.get(slot.key) ?? null } : { slot, entry: null })
    .filter((item): item is { slot: PortalSlot; entry: PortalEntry } => Boolean(item.entry));
}
