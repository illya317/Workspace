import type { ReactNode } from "react";

export const MAX_PORTAL_SLOTS = 9;
export const MAX_PINNED_PORTAL_SLOTS = 2;

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
  const seen = new Set<string>();
  let pinnedCount = 0;
  const slots: PortalSlot[] = [];
  for (let index = 0; index < MAX_PORTAL_SLOTS; index += 1) {
    const item = rawItems[index];
    const rawKey = item && typeof item === "object" && "key" in item
      ? (item as { key?: unknown }).key
      : item;
    let key = normalizeSlotKey(rawKey);
    if (key && (seen.has(key) || (validKeys && !validKeys.has(key)))) key = null;
    if (key) seen.add(key);
    const wantsPinned = Boolean(item && typeof item === "object" && "pinned" in item && (item as { pinned?: unknown }).pinned);
    const pinned = Boolean(key && wantsPinned && pinnedCount < MAX_PINNED_PORTAL_SLOTS);
    if (pinned) pinnedCount += 1;
    slots.push({ key, pinned });
  }
  return slots;
}

export function defaultPortalSlots(entries: readonly PortalEntry[]): PortalSlot[] {
  const preferred = entries.filter((entry) => entry.level === 1).slice(0, MAX_PORTAL_SLOTS);
  return Array.from({ length: MAX_PORTAL_SLOTS }, (_, index) => ({
    key: preferred[index]?.key ?? null,
    pinned: false,
  }));
}

export function configuredPortalSlots(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return normalizePortalSlots(slots, new Set(byKey.keys()));
}

export function effectivePortalSlots(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const normalized = configuredPortalSlots(slots, entries);
  return normalized.some((slot) => slot.key) ? normalized : defaultPortalSlots(entries);
}

export function portalSlotEntries(slots: readonly PortalSlot[], entries: readonly PortalEntry[]) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return slots
    .map((slot) => slot.key ? { slot, entry: byKey.get(slot.key) ?? null } : { slot, entry: null })
    .filter((item): item is { slot: PortalSlot; entry: PortalEntry } => Boolean(item.entry));
}

