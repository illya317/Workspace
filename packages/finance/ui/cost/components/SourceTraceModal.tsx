"use client";

import { createPageBody, BodySurface, createFieldsSection, createPageModalSection } from "@workspace/core/ui";
import type { BodySurfaceModalSpec } from "@workspace/core/ui";
import type { SourceTraceInfo } from "../types";
interface Props {
  open: boolean;
  info: SourceTraceInfo | null;
  onClose: () => void;
}
export default function SourceTraceModal({
  open,
  info,
  onClose
}: Props) {
  const modal = createSourceTraceModal({ open, info, onClose });
  if (!modal) return null;
  return (
    <BodySurface {...createPageBody([modal])} />
  );
}

export function createSourceTraceModal({ open, info, onClose }: Props): BodySurfaceModalSpec | null {
  if (!open || !info) return null;
  return createPageModalSection("source-trace", {
    open,
    title: "数据来源",
    onClose,
    size: "lg",
    sections: [
      createFieldsSection("source-trace-form", [
        { key: "sourceFile", label: "源文件", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceFile },
        { key: "sourceSheet", label: "工作表", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceSheet ?? "—" },
        { key: "sourceRow", label: "行号", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceRow ?? "—" },
      ], {
        kind: "detail",
        actions: [{ key: "close", action: "close", label: "关闭", onClick: onClose }],
      }),
    ],
  });
}
