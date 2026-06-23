export type ActionGlyphKind = "add" | "edit" | "check" | "x" | "view" | "delete";

export interface ActionGlyphProps {
  kind: ActionGlyphKind;
  className?: string;
}

export function ActionGlyph({ kind, className = "h-5 w-5" }: ActionGlyphProps) {
  if (kind === "add") {
    return <span aria-hidden="true" className="-translate-y-px text-base leading-none">+</span>;
  }
  if (kind === "delete") {
    return <span aria-hidden="true" className="-translate-y-px text-xl leading-none">×</span>;
  }
  if (kind === "check") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
        <path d="m5 12.5 4.2 4.2L19 7" />
      </svg>
    );
  }
  if (kind === "x") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  }
  if (kind === "edit") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="m16.9 4.6 2.5 2.5" />
        <path d="M4.5 19.5l4.9-1 9.2-9.2a1.8 1.8 0 0 0 0-2.5l-1.4-1.4a1.8 1.8 0 0 0-2.5 0l-9.2 9.2-1 4.9z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
