"use client";

import { FormField, SelectField } from "@workspace/core/ui";

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
    <FormField label="预算版本" layout="inline">
      <SelectField
        value={activeVersionId == null ? "" : String(activeVersionId)}
        onChange={(nextValue) => {
          if (nextValue) onChange(parseInt(nextValue));
        }}
        options={versions.map((v) => ({
          value: String(v.id),
          label: `${v.name} (${statusLabel(v.status)})`,
        }))}

      />
    </FormField>
  );
}
