"use client";

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
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">预算版本:</label>
      <select
        value={activeVersionId ?? ""}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({statusLabel(v.status)})
          </option>
        ))}
      </select>
    </div>
  );
}
