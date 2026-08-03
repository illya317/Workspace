"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type {
  DataSurfaceFrame,
  DataSurfaceMobilePresentation,
  DataSurfaceMobileSpec,
  DataSurfacePresentationSpec,
  DataSurfaceScrollSpec,
} from "../../DataSurface.types";
import MobileExperienceBoundary from "../../MobileExperienceBoundary";
import { joinClassNames } from "../common/card-utils";

export const MATRIX_ROW_HEADER_WIDTH = "20rem";
export const SCROLL_MAX_HEIGHT_PX = { sm: 320, md: 480, lg: 640 } as const;
const SCROLL_MAX_HEIGHT_CLASS = {
  sm: "max-h-64 max-sm:max-h-none",
  md: "max-h-96 max-sm:max-h-none",
  lg: "max-h-[36rem] max-sm:max-h-none",
} as const;

/** presentation.cellWrap / controlHeight 的单元格基类，与 legacy tablePresentation.cell 对齐。 */
export function presentationCellClass(presentation: DataSurfacePresentationSpec) {
  return joinClassNames(
    presentation.cellWrap === "wrap" ? "whitespace-normal break-words" : "whitespace-nowrap",
    presentation.controlHeight === "fillRow" ? "h-px align-middle" : "",
  );
}

/** presentation.header / rowHover=none / grid=none 的容器级样式。 */
export function presentationWrapperClass(presentation: DataSurfacePresentationSpec) {
  return joinClassNames(
    presentation.header === "strong" ? "[&_.ant-table-thead_th]:!bg-slate-100"
      : presentation.header === "plain" ? "[&_.ant-table-thead_th]:!bg-white" : "",
    presentation.rowHover === "none" ? "[&_.ant-table-tbody>tr:hover>td]:!bg-transparent" : "",
    presentation.grid === "none" ? "[&_.ant-table-thead>tr>th]:!border-b-0 [&_.ant-table-tbody>tr>td]:!border-b-0" : "",
  );
}

export function resolveRowHover(presentation: DataSurfacePresentationSpec, interactiveDefault: boolean) {
  return presentation.rowHover ?? (interactiveDefault ? "interactive" : "neutral");
}

export const ROW_HOVER_INTERACTIVE_CLASS = "cursor-pointer transition hover:[&>td]:!bg-emerald-50/60";
export const STRIPE_SUBTLE_CLASS = "[&>td]:bg-slate-50/50";

/** frame + scroll 的容器样式，对齐 legacy resolveSurfaceFrameClass。 */
export function antdDataFrameClass(
  frame: DataSurfaceFrame | undefined,
  scroll: DataSurfaceScrollSpec,
  antdHandlesVerticalScroll: boolean,
) {
  return joinClassNames(
    scroll.x === false ? "overflow-x-hidden" : "",
    scroll.y === "hidden" ? "overflow-y-hidden"
      : scroll.y === "auto" && !antdHandlesVerticalScroll ? "overflow-y-auto" : "",
    !antdHandlesVerticalScroll && scroll.maxHeight ? SCROLL_MAX_HEIGHT_CLASS[scroll.maxHeight] : "",
    frame === "clipped" ? "overflow-hidden rounded-md" : "",
    frame === "bordered" ? "overflow-hidden rounded-md border border-slate-200 bg-white" : "",
  );
}

export function resolveMobilePresentation(mobile: DataSurfaceMobileSpec | undefined, matrix: boolean): DataSurfaceMobilePresentation {
  return mobile?.presentation ?? (matrix ? "landscape" : "list");
}

export function withMobileDataExperience(content: ReactNode, presentation: DataSurfaceMobilePresentation, mobile?: DataSurfaceMobileSpec) {
  if (presentation === "list") return content;
  return (
    <MobileExperienceBoundary
      strategy={presentation}
      title={mobile?.title ?? (presentation === "landscape" ? "数据矩阵" : "该数据视图")}
      reason={mobile?.reason}
    >
      {content}
    </MobileExperienceBoundary>
  );
}

function isNestedInteractiveTarget(target: EventTarget | null, row: Element) {
  if (!(target instanceof Element) || target === row) return false;
  return Boolean(target.closest("a,button,input,select,textarea,summary,details,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}

export function activateAntdDataRowFromClick<T>(
  event: MouseEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
  onRowClick(row);
}

export function activateAntdDataRowFromKeyboard<T>(
  event: KeyboardEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onRowClick(row);
}
