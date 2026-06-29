"use client";

import { createPageBody, PageSurface, createInlineFieldsSection } from "@workspace/core/ui";

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

export default function BudgetVersionSelector({ versions, activeVersionId, onChange }: Props) {
  if (versions.length === 0) {
    return <span className="text-sm text-gray-400">暂无版本</span>;
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createInlineFieldsSection("budget-version", [{
          key: "version",
          label: "预算版本",
          spec: {
            valueType: "number",
            control: "choice",
            options: {
              source: "static",
              mode: "dropdown",
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
        }]),
      ])}
    />
  );
}
