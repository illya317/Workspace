"use client";

import { createPageBody, PageSurface, createPageDataBlock } from "@workspace/core/ui";

interface ImportResultProps {
  success: boolean;
  message: string;
}

export default function ImportResult({ success, message }: ImportResultProps) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createPageDataBlock("import-result", {
          kind: "metrics",
          framed: true,


          metrics: [{
            key: "result",
            label: success ? "成功" : "失败",
            value: message,
          }],
        }),
      ])}
    />
  );
}
