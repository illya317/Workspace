"use client";

import { FormSurface } from "@workspace/core/ui";
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
  return <FormSurface
    kind="modal"
    open
    title="数据来源"
    onClose={onClose}
    maxWidth="max-w-lg"
    mode="detail"
    fields={[
      { key: "sourceFile", label: "源文件", spec: { valueType: "string", editor: "input", state: "readonly" }, value: info.sourceFile },
      { key: "sourceSheet", label: "工作表", spec: { valueType: "string", editor: "input", state: "readonly" }, value: info.sourceSheet ?? "—" },
      { key: "sourceRow", label: "行号", spec: { valueType: "string", editor: "input", state: "readonly" }, value: info.sourceRow ?? "—" },
    ]}
    actions={[{ key: "close", label: "关闭", variant: "primary", onClick: onClose }]}
  />;
}
