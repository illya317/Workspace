"use client";

import { PageSurface, createPageDataBlock } from "@workspace/core/ui";

interface ImportResultProps {
  success: boolean;
  message: string;
}

export default function ImportResult({ success, message }: ImportResultProps) {
  return (
    <PageSurface
      kind="list"
      embedded
      blocks={[
        createPageDataBlock("import-result", {
          kind: "metrics",
          framed: true,
          className: success ? "mb-6 border-emerald-100 bg-emerald-50" : "mb-6 border-red-100 bg-red-50",
          bodyClassName: success ? "flex items-center gap-3 p-4 text-sm text-emerald-700" : "flex items-center gap-3 p-4 text-sm text-red-700",
          metrics: [{
            key: "result",
            label: success ? "成功" : "失败",
            value: message,
          }],
        }),
      ]}
    />
  );
}
