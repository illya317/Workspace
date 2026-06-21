"use client";

import { ActionButton, DetailModal } from "@workspace/core/ui";
import type { SourceTraceInfo } from "../types";

interface Props {
  open: boolean;
  info: SourceTraceInfo | null;
  onClose: () => void;
}

export default function SourceTraceModal({ open, info, onClose }: Props) {
  if (!open || !info) return null;

  return (
    <DetailModal open title="数据来源" onClose={onClose} maxWidth="max-w-lg">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">源文件</span>
            <span className="font-medium text-gray-800">{info.sourceFile}</span>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">工作表</span>
            <span className="font-medium text-gray-800">{info.sourceSheet ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">行号</span>
            <span className="font-medium text-gray-800">{info.sourceRow ?? "—"}</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <ActionButton onClick={onClose} variant="primary">
            关闭
          </ActionButton>
        </div>
    </DetailModal>
  );
}
