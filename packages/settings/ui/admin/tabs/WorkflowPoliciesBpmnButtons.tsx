"use client";

import { ActionGlyph, type ActionGlyphKind } from "@workspace/core/ui";

export type BpmnButtonKind = ActionGlyphKind | "exclusive-gateway" | "inclusive-gateway" | "parallel-gateway" | "approval-node";

export function BpmnIconButton(input: {
  kind: BpmnButtonKind;
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant?: "secondary" | "danger";
}) {
  const danger = input.variant === "danger";
  return (
    <button
      type="button"
      aria-label={input.label}
      title={input.label}
      disabled={input.disabled}
      onClick={input.onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
    >
      <BpmnButtonGlyph kind={input.kind} />
    </button>
  );
}

function BpmnButtonGlyph(input: { kind: BpmnButtonKind }) {
  if (input.kind === "exclusive-gateway") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 50 50" fill="none">
        <path d="M25 1.5 48.5 25 25 48.5 1.5 25 25 1.5Z" fill="#dbeafe" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <path d="M19 19 L31 31 M31 19 L19 31" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (input.kind === "parallel-gateway") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 50 50" fill="none">
        <path d="M25 1.5 48.5 25 25 48.5 1.5 25 25 1.5Z" fill="#dbeafe" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <path d="M25 16.5 V33.5 M16.5 25 H33.5" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (input.kind === "inclusive-gateway") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 50 50" fill="none">
        <path d="M25 1.5 48.5 25 25 48.5 1.5 25 25 1.5Z" fill="#dbeafe" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="25" cy="25" r="8.5" stroke="#3b82f6" strokeWidth="3" />
      </svg>
    );
  }
  if (input.kind === "approval-node") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return <ActionGlyph kind={input.kind} className="h-4 w-4" />;
}
