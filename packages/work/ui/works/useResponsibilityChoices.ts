"use client";

import { useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import type { InputOptionGroup } from "@workspace/core/ui";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import type { WorkTarget } from "./types";

export type ResponsibilityChoice = {
  id: number;
  name: string;
  subtitle?: string;
  lockedEmployeeId: number;
  lockedEmployeeName: string;
  groupKey?: string | null;
  groupLabel?: string | null;
};

export type ResponsibilityPositionChoice = {
  id: number;
  name: string;
  subtitle?: string;
  isPrimary?: boolean;
};

export function useResponsibilityPositionChoices({
  enabled,
  target,
  ownerEmployeeId,
}: {
  enabled: boolean;
  target?: WorkTarget | null;
  ownerEmployeeId?: number | null;
}) {
  const [options, setOptions] = useState<ResponsibilityPositionChoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          fkKey: "work.tasks.owner.position",
          keyword: "",
          lifecycleScope: "active",
        });
        if (target?.targetType) params.set("targetType", target.targetType);
        if (target?.targetId) params.set("targetId", String(target.targetId));
        if (ownerEmployeeId) params.set("ownerEmployeeId", String(ownerEmployeeId));
        const response = await fetch(workspacePath(`${WORK_REFERENCE_OPTIONS_ENDPOINT}?${params.toString()}`));
        const data = await response.json().catch(() => ({})) as { items?: ResponsibilityPositionChoice[] };
        if (!cancelled) setOptions(response.ok ? data.items ?? [] : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, ownerEmployeeId, target?.targetId, target?.targetType]);

  const items = useMemo(() => options.map((option) => ({
    value: String(option.id),
    label: option.name,
    description: option.subtitle,
  })), [options]);
  const byId = useMemo(() => new Map(options.map((option) => [String(option.id), option])), [options]);
  return { byId, items, loading, options };
}

export function useResponsibilityChoices({
  enabled,
  fkKey,
  target,
  ownerEmployeeId,
  positionId,
}: {
  enabled: boolean;
  fkKey: string;
  target?: WorkTarget | null;
  ownerEmployeeId?: number | null;
  positionId?: number | null;
}) {
  const [options, setOptions] = useState<ResponsibilityChoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          fkKey,
          keyword: "",
          lifecycleScope: "active",
        });
        if (target?.targetType) params.set("targetType", target.targetType);
        if (target?.targetId) params.set("targetId", String(target.targetId));
        if (ownerEmployeeId) params.set("ownerEmployeeId", String(ownerEmployeeId));
        if (positionId) params.set("positionId", String(positionId));
        const response = await fetch(workspacePath(`${WORK_REFERENCE_OPTIONS_ENDPOINT}?${params.toString()}`));
        const data = await response.json().catch(() => ({})) as { items?: ResponsibilityChoice[] };
        if (!cancelled) setOptions(response.ok ? data.items ?? [] : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, fkKey, ownerEmployeeId, positionId, target?.targetId, target?.targetType]);

  const groups = useMemo<InputOptionGroup[]>(() => {
    const grouped = new Map<string, InputOptionGroup>();
    for (const option of options) {
      const key = option.groupKey || "ungrouped";
      const label = option.groupLabel || "未分组职责";
      const group = grouped.get(key) ?? { key, label, options: [] };
      group.options.push({
        value: String(option.id),
        label: option.name,
        description: option.subtitle,
      });
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [options]);

  const byId = useMemo(() => new Map(options.map((option) => [String(option.id), option])), [options]);
  const items = useMemo(() => options.map((option) => ({
    value: String(option.id),
    label: option.name,
    description: option.subtitle,
  })), [options]);
  return { byId, groups, items, loading };
}
