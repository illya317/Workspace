import type { ReactNode } from "react";
import { Toolbar, type ToolbarItem } from "./Toolbar";

export interface CommandToolbarProps {
  filters?: ReactNode;
  viewControls?: ReactNode;
  selectionActions?: ReactNode;
  editActions?: ReactNode;
  meta?: ReactNode;
  className?: string;
  onSubmit?: () => void;
}

function slotItem(key: string, section: "view" | "filter" | "action" | "edit" | "meta", content: ReactNode): ToolbarItem | null {
  if (!content) return null;
  return { kind: "custom", key, section, content };
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
  const items: ToolbarItem[] = [
    slotItem("view", "view", viewControls),
    slotItem("filter", "filter", filters),
    slotItem("action", "action", selectionActions),
    slotItem("edit", "edit", editActions),
    slotItem("meta", "meta", meta),
  ].filter((item): item is ToolbarItem => item !== null);

  return <Toolbar items={items} className={className} onSubmit={onSubmit} />;
}
