import type { DocsEditorTemplateRow } from "./db";

export type TemplateMetadataUpdate = Partial<Pick<
  DocsEditorTemplateRow,
  "title" | "type" | "sourceKind" | "sourceProductKey" | "sourceStageKeys"
>>;

export function nextDraftStorageTemplate(
  template: DocsEditorTemplateRow,
  data: TemplateMetadataUpdate,
  version: number,
): DocsEditorTemplateRow {
  return {
    ...template,
    title: typeof data.title === "string" ? data.title : template.title,
    type: typeof data.type === "string" ? data.type : template.type,
    sourceKind: data.sourceKind === undefined ? template.sourceKind : data.sourceKind ?? null,
    sourceProductKey: data.sourceProductKey === undefined ? template.sourceProductKey : data.sourceProductKey ?? null,
    sourceStageKeys: data.sourceStageKeys === undefined ? template.sourceStageKeys : data.sourceStageKeys ?? null,
    version,
  };
}
