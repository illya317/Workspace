"use client";

import { InputSurface } from "@workspace/core/ui";
import { normalizeDepartmentCodeInput, type OrganizationHierarchyKind } from "./utils";
import type { OrganizationCodeConfig } from "./types";

export function departmentCodeEditableSegment(
  level: 1 | 2 | 3,
  hierarchyKind: OrganizationHierarchyKind = "M",
  codeConfig?: OrganizationCodeConfig | null,
) {
  if (!codeConfig) {
    return {
      extract: () => "",
      compose: (_segment: string, code: string) => code,
      normalize: () => "",
      placeholder: "",
    };
  }
  const rootSuffix = codeConfig.department.managementRootSuffix;
  const level2Suffix = codeConfig.department.level2Suffix;
  const level2Length = codeConfig.department.level2SequenceLength;
  const level3Length = codeConfig.department.level3SequenceLength;
  const identifierLength = codeConfig.department.identifierLength;
  const separator = codeConfig.department.separator;
  const identifierExample = codeConfig.department.identifierFormat === "uppercaseAlphanumeric"
    ? "A1".repeat(Math.ceil(identifierLength / 2)).slice(0, identifierLength)
    : codeConfig.department.identifierFormat === "freeText"
      ? "组织".repeat(Math.ceil(identifierLength / 2)).slice(0, identifierLength)
      : "ABC".repeat(Math.ceil(identifierLength / 3)).slice(0, identifierLength);
  if (hierarchyKind === "G") {
    return {
      extract: (code: string) => code.slice(0, identifierLength),
      compose: (segment: string) => normalizeDepartmentCodeInput(level, segment, hierarchyKind, codeConfig),
      normalize: (segment: string) => normalizeDepartmentCodeInput(level, segment, hierarchyKind, codeConfig),
      placeholder: `简称如 ${identifierExample}`,
    };
  }
  if (level === 1) {
    return {
      extract: (code: string) => code.slice(0, identifierLength),
      compose: (segment: string) => {
        const prefix = normalizeDepartmentCodeInput(level, segment, hierarchyKind, codeConfig);
        return prefix ? `${prefix}${separator}${rootSuffix}` : segment;
      },
      normalize: (segment: string) => normalizeDepartmentCodeInput(level, segment, hierarchyKind, codeConfig),
      placeholder: `简称如 ${identifierExample}`,
    };
  }
  if (level === 2) {
    return {
      extract: (code: string) => code.slice(identifierLength + separator.length, -level2Suffix.length),
      compose: (segment: string, code: string) => {
        const prefix = code.slice(0, identifierLength);
        const numberPart = segment.replace(/\D/g, "").slice(0, level2Length);
        return numberPart ? `${prefix}${separator}${numberPart}${level2Suffix}` : code;
      },
      normalize: (segment: string) => segment.replace(/\D/g, "").slice(0, level2Length),
      placeholder: "序号如 1 或 12",
    };
  }
  return {
    extract: (code: string) => code.slice(-level3Length),
    compose: (segment: string, code: string) => {
      const prefix = code.slice(0, identifierLength);
      const stem = code.slice(identifierLength + separator.length, -level3Length) || "1";
      const tail = segment.replace(/\D/g, "").slice(0, level3Length).padStart(level3Length, "0");
      return tail && Number(tail) > 0 ? `${prefix}${separator}${stem}${tail}` : code;
    },
    normalize: (segment: string) => segment.replace(/\D/g, "").slice(0, level3Length),
    placeholder: `尾号如 ${String(1).padStart(level3Length, "0")}`,
  };
}

export function DepartmentCodeInput({
  value,
  hierarchyKind = "M",
  level,
  codeConfig,
  disabled,
  onChange,
}: {
  value: string;
  hierarchyKind?: OrganizationHierarchyKind;
  level: 1 | 2 | 3;
  codeConfig?: OrganizationCodeConfig | null;
  disabled?: boolean;
  onChange: (fullCode: string) => void;
  className?: string;
}) {
  return (
    <InputSurface
      spec={{
        valueType: "string",
        control: "text",
        mask: { kind: "editableSegment", ...departmentCodeEditableSegment(level, hierarchyKind, codeConfig) },
        state: disabled ? "disabled" : "normal",
      }}
      value={value}
      onChange={(next) => onChange(String(next ?? ""))}
    />
  );
}
