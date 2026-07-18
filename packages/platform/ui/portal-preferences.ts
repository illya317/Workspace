"use client";

import {
  MAX_PRIMARY_PORTAL_SLOTS,
  configuredPortalSlots,
  defaultPortalSlots,
  effectivePortalSlots,
  portalEntriesFromModules,
  portalSlotEntries,
  type PortalEntry,
  type PortalSlot,
} from "../portal-preferences";
import type { SessionUser } from "../types";
import { getAccessibleModules, type ModuleDef } from "../module-nav";
import { moduleIcons } from "../icons";
import { requestJson, putJson } from "./api-client";

const PORTAL_SLOTS_ENDPOINT = "/api/settings/account/portal-slots";

export interface PortalSlotSettings {
  slots: PortalSlot[];
}

function withResolvedChildIcons(modules: ModuleDef[]) {
  return modules.map((module) => ({
    ...module,
    children: module.children?.map((child) => ({
      ...child,
      icon: moduleIcons[child.iconKey],
    })),
  }));
}

export function accessiblePortalEntries(user: SessionUser): PortalEntry[] {
  return portalEntriesFromModules(withResolvedChildIcons(getAccessibleModules(user)));
}

export function defaultSlotsForUser(user: SessionUser) {
  return defaultPortalSlots(accessiblePortalEntries(user));
}

export function effectiveSlotsForUser(user: SessionUser, slots: readonly PortalSlot[]) {
  return effectivePortalSlots(slots, accessiblePortalEntries(user));
}

export function configuredSlotsForUser(user: SessionUser, slots: readonly PortalSlot[]) {
  return configuredPortalSlots(slots, accessiblePortalEntries(user));
}

export function portalCardsForUser(user: SessionUser, slots: readonly PortalSlot[]) {
  return portalSlotEntries(effectiveSlotsForUser(user, slots), accessiblePortalEntries(user));
}

export function defaultPortalCardsForUser(user: SessionUser) {
  const entries = accessiblePortalEntries(user);
  const defaultEntries = entries.filter((entry) => entry.level === 1).slice(0, MAX_PRIMARY_PORTAL_SLOTS);
  return portalSlotEntries(defaultEntries.map((entry) => ({ key: entry.key, pinned: false })), entries);
}

export function headerShortcutsForUser(user: SessionUser, slots: readonly PortalSlot[]) {
  const entries = accessiblePortalEntries(user);
  return portalSlotEntries(configuredSlotsForUser(user, slots), entries)
    .filter((item) => item.slot.pinned)
    .slice(0, 2);
}

export function fetchPortalSlotSettings() {
  return requestJson<PortalSlotSettings>(PORTAL_SLOTS_ENDPOINT, {
    fallbackMessage: "加载个性化桌面失败",
  });
}

export function savePortalSlots(slots: PortalSlot[]) {
  return putJson<{ success: true; slots: PortalSlot[] }>(
    PORTAL_SLOTS_ENDPOINT,
    { slots },
    "保存个性化桌面失败",
  );
}
