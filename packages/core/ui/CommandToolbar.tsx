import type { ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export interface CommandToolbarProps {
  filters?: ReactNode;
  viewControls?: ReactNode;
  selectionActions?: ReactNode;
  editActions?: ReactNode;
  meta?: ReactNode;
  className?: string;
  onSubmit?: () => void;
}

function ToolbarSection({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div className={joinClassNames("flex min-h-10 min-w-0 flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-slate-200 sm:inline-block" />;
}

export default function CommandToolbar({
  filters,
  viewControls,
  selectionActions,
  editActions,
  meta,
  className = "",
  onSubmit,
}: CommandToolbarProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className={joinClassNames("relative z-20 flex min-h-14 flex-wrap items-center gap-3 overflow-visible rounded-lg border border-slate-200 bg-white p-3 shadow-sm", className)}
    >
      <ToolbarSection className="shrink-0">{viewControls}</ToolbarSection>
      {viewControls && filters && <Divider />}
      <ToolbarSection>{filters}</ToolbarSection>
      {filters && selectionActions && <Divider />}
      <ToolbarSection className="shrink-0">{selectionActions}</ToolbarSection>
      {editActions && <Divider />}
      <ToolbarSection className="shrink-0">{editActions}</ToolbarSection>
      <div className="min-w-4 flex-1 basis-4" />
      {meta && <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">{meta}</div>}
    </form>
  );
}
