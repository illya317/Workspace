import type { EditorSpaceDto } from "./api";

export function docsWorkflowTargetType(value: EditorSpaceDto["targetType"]) {
  return value === "company" || value === "committee" || value === "department" ? value : null;
}
