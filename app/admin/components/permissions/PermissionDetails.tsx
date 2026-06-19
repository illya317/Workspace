"use client";

import { sourceLabel } from "../../lib";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface PermissionDetailsProps {
  subject: { id: number; name: string; extra?: Record<string, unknown> };
  s: PermissionsTabState;
}

export default function PermissionDetails({
  subject,
  s,
}: PermissionDetailsProps) {
  const details: string[] = [];

  for (const role of s.roles) {
    const state = s.getPermissionState(subject, role.key);
    if (state.has && state.source) {
      details.push(`${role.name}: ${sourceLabel(state.source)}`);
    }
  }

  if (details.length === 0) {
    return <p className="text-xs text-gray-400">无权限</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {details.map((d, i) => (
        <span
          key={i}
          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-gray-600"
        >
          {d}
        </span>
      ))}
    </div>
  );
}
