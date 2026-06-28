"use client";

import { PageSurface, createPageFormModalBlock } from "@workspace/core/ui";
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
  if (!open || !info) return null;
  return (
    <PageSurface
      kind="list"
      embedded
      blocks={[
        createPageFormModalBlock("source-trace", {
          open,
          title: "数据来源",
          onClose,
          maxWidth: "max-w-lg",
        }, {
          kind: "detail",
          fields: [
            { key: "sourceFile", label: "源文件", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceFile },
            { key: "sourceSheet", label: "工作表", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceSheet ?? "—" },
            { key: "sourceRow", label: "行号", spec: { valueType: "string", control: "text", state: "readonly" }, value: info.sourceRow ?? "—" },
          ],
          actions: [{ key: "close", label: "关闭", variant: "primary", onClick: onClose }],
        }),
      ]}
    />
  );
}
