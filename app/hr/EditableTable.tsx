"use client";

import type { TabConfig, FieldConfig } from "./types";

export function getVal(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function renderCell(item: any, field: FieldConfig, config: TabConfig) {
  if (field.key === "gender") return item.gender === true ? "男" : item.gender === false ? "女" : "-";
  if (field.key === "isActive") return item.isActive === true ? "在职" : item.isActive === false ? "离职" : "-";
  if (field.key === "level") {
    const map: Record<number, string> = { 1: "事业部", 2: "部门", 3: "子部门" };
    return map[item.level] ?? item.level;
  }
  if (field.type === "boolean") return item[field.key] ? "是" : "否";
  if (field.type === "fk" && config.fkFields?.[field.key]) {
    const v = field.displayField
      ? getVal(item, field.displayField)
      : getVal(item, field.key + "Name") ?? getVal(item, config.fkFields[field.key].displayField) ?? "";
    return v || "-";
  }
  const v = field.displayField ? getVal(item, field.displayField) : item[field.key];
  return (v === null || v === undefined || v === "") ? "-" : v;
}

interface EditableTableProps {
  items: any[];
  visibleFields: FieldConfig[];
  config: TabConfig;
  editingCell: { id: number; field: string } | null;
  editMode: boolean;
  canEdit: boolean;
  renderEditInput: (fieldKey: string) => React.ReactNode;
  onStartEdit: (item: any, field: FieldConfig) => void;
}

export default function EditableTable({
  items,
  visibleFields,
  config,
  editingCell,
  editMode,
  canEdit,
  renderEditInput,
  onStartEdit,
}: EditableTableProps) {
  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-50">
        <tr>
          {visibleFields.map((f) => (
            <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600" style={{ width: f.width }}>
              {f.label}
            </th>
          ))}

        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
            {visibleFields.map((f) => {
              const isEditing = editingCell?.id === item.id && editingCell?.field === f.key;
              return (
                <td
                  key={f.key}
                  onClick={() => onStartEdit(item, f)}
                  className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && f.editable && canEdit ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                >
                  {isEditing ? renderEditInput(f.key) : renderCell(item, f, config)}
                </td>
              );
            })}

          </tr>
        ))}
      </tbody>
    </table>
  );
}
