import { workspacePath } from "@workspace/core/routing";
import {
  activeStandardBusinessSpaceNavigationKey,
  createStandardBusinessSpaceNavigationItems,
  filterStandardBusinessSpacesByNavigation,
  standardBusinessSpaceNavigationKey,
  standardBusinessSpaceNavigationTarget,
  type SpaceWorkbenchKindOption,
} from "@workspace/platform/ui/space-workbench";
import type { EditorSpaceDto } from "./api";

export const DOCS_EDITOR_VIEW_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "templates", label: "文档模板" },
  { key: "workflow", label: "待处理" },
];

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function pushTemplateHistory(templateId: string) {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", workspacePath(`/docs/editor/templates/${encodeURIComponent(templateId)}`));
}

function docsSpaceTargetKey(space: EditorSpaceDto) {
  return standardBusinessSpaceNavigationKey(space);
}

function docsDepartmentLabel(space: EditorSpaceDto) {
  return space.title.replace(/模板空间$/, "") || space.title;
}

export function docsSpaceKindOptions(spaces: EditorSpaceDto[], preferredDepartmentIds: number[], activeSpace: EditorSpaceDto | null): SpaceWorkbenchKindOption[] {
  void activeSpace;
  return createStandardBusinessSpaceNavigationItems({
    spaces,
    preferredDepartmentIds,
    getDepartmentLabel: docsDepartmentLabel,
  });
}

export function docsSpaceNavigationKey(activeSpace: EditorSpaceDto, items: SpaceWorkbenchKindOption[]) {
  return activeStandardBusinessSpaceNavigationKey(activeSpace, items);
}

export function filterDocsSpacesByNavigation(spaces: EditorSpaceDto[], key: string | null) {
  return filterStandardBusinessSpacesByNavigation(spaces, key);
}

export function docsNavigationTargetSpace(spaces: EditorSpaceDto[], key: string, activeSpace: EditorSpaceDto | null) {
  const exact = standardBusinessSpaceNavigationTarget(spaces, key);
  if (exact) return exact;
  return activeSpace && docsSpaceTargetKey(activeSpace) === key ? activeSpace : null;
}
