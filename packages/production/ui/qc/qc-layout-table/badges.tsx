"use client";

export type AdvancedBadgeKind = "formulaInput" | "formulaOutput" | "reference" | "input" | "date" | "param";

function advancedBadgePalette(kind: AdvancedBadgeKind) {
  if (kind === "formulaOutput" || kind === "reference" || kind === "param") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function AdvancedFieldBadge({
  label, kind, title, formulaText, active = false, highlighted = false, fieldKey, anchorKey, onToggle,
}: {
  label: string;
  kind: AdvancedBadgeKind;
  title?: string;
  formulaText?: string;
  active?: boolean;
  highlighted?: boolean;
  fieldKey?: string;
  anchorKey?: string;
  onToggle?: (fieldKey: string | null) => void;
}) {
  const clickable = !!fieldKey && !!onToggle;
  return (
    <span
      className="relative mx-1 inline-flex overflow-visible align-middle"
      data-inline-feedback={anchorKey ? "true" : undefined}
      data-inline-feedback-kind={anchorKey ? "field" : undefined}
      data-inline-feedback-key={anchorKey || undefined}
      data-inline-feedback-label={title || anchorKey || label}
      data-inline-feedback-badge-kind={kind}
    >
      <span
        title={title}
        onClick={clickable ? () => onToggle(active ? null : fieldKey || null) : undefined}
        className={`inline-flex min-h-7 min-w-12 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold leading-5 transition-colors ${
          active
            ? kind === "formulaOutput" || kind === "reference" || kind === "param"
              ? "border-red-400 bg-red-100 text-red-800 shadow-sm"
              : "border-emerald-400 bg-emerald-100 text-emerald-800 shadow-sm"
            : highlighted
              ? "border-amber-300 bg-amber-50 text-amber-800 shadow-sm"
              : advancedBadgePalette(kind)
        } ${clickable ? "cursor-pointer select-none" : ""}`}
      >
        {label}
      </span>
      {active && formulaText ? (
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 inline-block w-max max-w-sm -translate-x-1/2 whitespace-normal rounded-md border border-slate-200/80 bg-white/80 px-3 py-2 text-left text-xs font-normal leading-5 text-slate-700 shadow-lg backdrop-blur-sm [overflow-wrap:anywhere]">
          {formulaText}
        </span>
      ) : null}
    </span>
  );
}

export function AdvancedParamText({ text, title, anchorKey }: { text: string; title?: string; anchorKey?: string }) {
  return (
    <span
      title={title}
      className="mx-1 inline-block border-b border-red-300 px-0.5 text-red-700"
      data-inline-feedback={anchorKey ? "true" : undefined}
      data-inline-feedback-kind={anchorKey ? "field" : undefined}
      data-inline-feedback-key={anchorKey || undefined}
      data-inline-feedback-label={title || text}
      data-inline-feedback-badge-kind={anchorKey ? "param" : undefined}
    >
      {text}
    </span>
  );
}
