"use client";

import type { CodeItem } from "../types";

interface CodeRowProps {
  item: CodeItem;
  count: number;
  isSelected?: boolean;
  onCodeClick?: () => void;
  onNameClick?: () => void;
  onCountClick?: () => void;
}

export default function CodeRow({
  item,
  count,
  isSelected,
  onCodeClick,
  onNameClick,
  onCountClick,
}: CodeRowProps) {
  return (
    <tr
      className={`border-b last:border-0 hover:bg-gray-50 ${isSelected ? "bg-emerald-50" : ""}`}
    >
      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
        <span
          className={onCodeClick ? "cursor-pointer hover:text-emerald-600" : ""}
          onClick={onCodeClick}
        >
          {item.code}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
        <span
          className={onNameClick ? "cursor-pointer hover:text-emerald-600" : ""}
          onClick={onNameClick}
        >
          {item.name || "-"}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
        <span
          className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
          onClick={onCountClick}
        >
          {count}
        </span>
      </td>
    </tr>
  );
}
