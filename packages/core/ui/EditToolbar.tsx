"use client";

import { Toolbar } from "./Toolbar";
import type { ToolbarEditGroupItem } from "./Toolbar.types";

export type EditToolbarProps = Omit<ToolbarEditGroupItem, "kind" | "key" | "section">;

export default function EditToolbar(props: EditToolbarProps) {
  if (!props.canEdit && !props.onDownload) return null;
  return <Toolbar items={[{ kind: "edit-group", key: "edit", ...props }]} variant="inline" />;
}
