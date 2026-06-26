"use client";

import { SegmentedCodeInput } from "@workspace/platform/ui";
import { normalizeDepartmentCodeInput } from "./utils";

function buildEditableSegment(level: 1 | 2 | 3) {
  if (level === 1) {
    return {
      extract: (code: string) => code.slice(0, 3),
      compose: (segment: string) => {
        const prefix = segment.slice(0, 3).toUpperCase();
        return prefix ? `${prefix}001` : segment;
      },
      normalize: (segment: string) => segment.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3),
      placeholder: "前缀如 FUN",
    };
  }
  if (level === 2) {
    return {
      extract: (code: string) => code.slice(3, -2),
      compose: (segment: string, code: string) => {
        const prefix = code.slice(0, 3);
        const numberPart = segment.replace(/\D/g, "").slice(0, 4);
        return numberPart ? `${prefix}${numberPart}00` : code;
      },
      normalize: (segment: string) => segment.replace(/\D/g, "").slice(0, 4),
      placeholder: "序号如 1 或 12",
    };
  }
  return {
    extract: (code: string) => code.slice(-2),
    compose: (segment: string, code: string) => {
      const prefix = code.slice(0, 3);
      const stem = code.slice(3, -2) || "1";
      const tail = segment.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
      return tail && tail !== "00" ? `${prefix}${stem}${tail}` : code;
    },
    normalize: (segment: string) => normalizeDepartmentCodeInput(3, segment),
    placeholder: "尾号如 01",
  };
}

export function DepartmentCodeInput({
  value,
  level,
  disabled,
  onChange,
  className,
}: {
  value: string;
  level: 1 | 2 | 3;
  disabled?: boolean;
  onChange: (fullCode: string) => void;
  className?: string;
}) {
  return (
    <SegmentedCodeInput
      value={value}
      disabled={disabled}
      className={className}
      editableSegment={buildEditableSegment(level)}
      onChange={onChange}
    />
  );
}
