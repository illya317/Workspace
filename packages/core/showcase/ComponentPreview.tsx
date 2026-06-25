"use client";

import type { FC } from "react";
import {
  toolbarPreviewByName,
  formPreviewByName,
  dataPreviewByName,
  layoutPreviewByName,
  overlayPreviewByName,
  navigationPreviewByName,
  pickerPreviewByName,
  selectorPreviewByName,
  statusPreviewByName,
  cellPreviewByName,
  feedbackPreviewByName,
} from "./previews";

const previewByName: Record<string, FC> = {
  ...toolbarPreviewByName,
  ...formPreviewByName,
  ...dataPreviewByName,
  ...layoutPreviewByName,
  ...overlayPreviewByName,
  ...navigationPreviewByName,
  ...pickerPreviewByName,
  ...selectorPreviewByName,
  ...statusPreviewByName,
  ...cellPreviewByName,
  ...feedbackPreviewByName,
};

export function ComponentPreview({ name }: { name: string }) {
  const Preview = previewByName[name];
  if (!Preview) {
    return <span className="text-xs text-slate-400">暂无实时预览</span>;
  }
  return <Preview />;
}
