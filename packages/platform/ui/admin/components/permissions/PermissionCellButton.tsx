"use client";

import { ActionGlyph, type ActionGlyphKind } from "@workspace/core/ui";

export type PermissionCellButtonTone = "empty" | "direct" | "organization" | "derived";

interface PermissionCellButtonProps {
  tone: PermissionCellButtonTone;
  icon: ActionGlyphKind;
  label: string;
  title?: string;
  onClick: () => void;
}

const TONE_CLASS: Record<PermissionCellButtonTone, string> = {
  empty: "border border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
  direct: "bg-emerald-600 text-white hover:bg-emerald-700",
  organization: "border border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-200 hover:bg-amber-100",
  derived: "border border-sky-100 bg-sky-50 text-sky-700 hover:border-sky-200 hover:bg-sky-100",
};

const BASE_CLASS = "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold shadow-sm transition";

export default function PermissionCellButton({
  tone,
  icon,
  label,
  title = label,
  onClick,
}: PermissionCellButtonProps) {
  const buttonClassName = `${BASE_CLASS} ${TONE_CLASS[tone]}`;
  return (
    <button type="button" onClick={onClick} className={buttonClassName} aria-label={label} title={title}>
      <ActionGlyph kind={icon} className="h-4 w-4" />
    </button>
  );
}
