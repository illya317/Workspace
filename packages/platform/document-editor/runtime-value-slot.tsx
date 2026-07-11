"use client";

import type { EditorSlotInline } from "./types";

export function DocumentRuntimeValueSlot({
  part,
  value,
}: {
  part: EditorSlotInline;
  value: unknown;
}) {
  const label = displayValue(value);
  const underlined = part.display !== "plain";
  return (
    <span
      title={slotTitle(part)}
      className={`mx-1 inline-block max-w-full overflow-hidden whitespace-pre-line px-1 leading-[1.45] text-slate-950 align-baseline ${underlined ? "border-b border-slate-500" : "border-b-0"}`}
      style={{
        width: `min(${cssSlotWidth(part.width)}, 100%)`,
        maxWidth: "100%",
        textAlign: slotTextAlign(part.align),
      }}
    >
      {label}
    </span>
  );
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function cssSlotWidth(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) return value.trim();
  return "3rem";
}

function slotTextAlign(value: string | undefined) {
  if (value === "right") return "right";
  if (value === "left") return "left";
  return "center";
}

function slotTitle(part: EditorSlotInline) {
  return [part.label, part.fieldKey].filter(Boolean).join(" · ");
}
