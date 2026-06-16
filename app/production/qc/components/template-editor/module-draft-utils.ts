import type {
  QcLayoutBlock,
  QcTemplateDetail,
  QcTemplateEditorDraft,
  QcTemplateModuleLibraryItem,
} from "@/server/services/production/qc";
import { clone, draftId, moduleDisplayName } from "./editor-utils";

export function moduleDraftFromItem(detail: QcTemplateDetail, item: QcTemplateModuleLibraryItem): QcTemplateEditorDraft {
  const target = {
    productKey: detail.id,
    productName: detail.productName,
    stageKey: "module_library",
    stageLabel: "模块库",
    nodeType: "module" as const,
    testNameEn: item.id,
    testName: moduleDisplayName(item),
    sequence: "模块",
  };
  const fallback: QcLayoutBlock[] = [{ type: "title", title: moduleDisplayName(item), sectionSuffix: "auto", sectionSlot: "auto" }];
  return {
    ...target,
    draftId: draftId(target),
    layoutDraft: { blocks: clone(item.blocks?.length ? item.blocks : fallback) },
    methodDraft: { methodGroups: [] },
    sourceTemplateId: item.templateId,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
}
