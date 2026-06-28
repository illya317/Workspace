import type { ActionGlyphRenderProps } from "./ActionGlyphPartsTypes";

type PermissionGlyphKind = Extract<ActionGlyphRenderProps["kind"], "permission-organization" | "permission-derived">;

export function PermissionActionGlyph({
  kind,
  className,
}: {
  kind: PermissionGlyphKind;
  className: string;
}) {
  if (kind === "permission-organization") {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="5.25" r="2.35" fill="currentColor" opacity="0.92" />
        <circle cx="6.5" cy="18.5" r="2.35" fill="currentColor" opacity="0.55" />
        <circle cx="17.5" cy="18.5" r="2.35" fill="currentColor" opacity="0.55" />
        <path d="M12 8.4v3.2M12 11.6H6.5v3.6M12 11.6h5.5v3.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect x="5" y="4" width="14" height="5" rx="1.5" fill="currentColor" opacity="0.75" />
      <path d="M12 10v7" stroke="currentColor" strokeLinecap="round" strokeWidth={2} />
      <path d="m8.5 14.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      <rect x="8" y="18.5" width="8" height="2" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
