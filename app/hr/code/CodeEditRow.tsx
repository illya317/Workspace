"use client";

import type { CodeItem } from "./types";

interface EditRowProps {
  item: CodeItem;
  editCodeValue: string;
  setEditCodeValue: (v: string) => void;
  editNameValue: string;
  setEditNameValue: (v: string) => void;
  count: number;
  selectedCode?: string;
  setDetailModal: (v: {
    open: boolean;
    code: string;
    name: string;
  } | null) => void;
}

export function EditRow({
  item,
  editCodeValue,
  setEditCodeValue,
  editNameValue,
  setEditNameValue,
  count,
  selectedCode,
  setDetailModal,
}: EditRowProps) {
  const isSelected = selectedCode === item.code;

  return (
    <tr
      className={`border-b last:border-0 hover:bg-gray-50 ${isSelected ? "bg-emerald-50" : ""}`}
    >
      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
        <input
          value={editCodeValue}
          onChange={(e) => setEditCodeValue(e.target.value)}
          className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
        <input
          value={editNameValue}
          onChange={(e) => setEditNameValue(e.target.value)}
          className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
        <span
          className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
          onClick={() =>
            setDetailModal({
              open: true,
              code: item.code,
              name: item.name,
            })
          }
        >
          {count}
        </span>
      </td>
    </tr>
  );
}
