"use client";

import { createInlineFieldsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";

interface Version {
  id: number;
  name: string;
  status: string;
  createdAt: string;
}

interface Props {
  versions: Version[];
  activeVersionId: number | null;
  onChange: (versionId: number) => void;
}

function statusLabel(status: string) {
  if (status === "active") return "生效";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

export function createBudgetVersionSection({ versions, activeVersionId, onChange }: Props): BodySurfaceSectionSpec | null {
  if (versions.length === 0) {
    return null;
  }

  return createInlineFieldsSection("budget-version", [{
    key: "version",
    label: "预算版本",
    spec: {
      valueType: "number",
      control: "choice",
      options: {
        source: "static",
        items: versions.map((v) => ({
          value: String(v.id),
          label: `${v.name} (${statusLabel(v.status)})`,
        })),
      },
    },
    value: activeVersionId == null ? "" : String(activeVersionId),
    onChange: (nextValue) => {
      if (nextValue) onChange(parseInt(String(nextValue), 10));
    },
  }]);
}
