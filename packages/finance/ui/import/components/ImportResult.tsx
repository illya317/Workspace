"use client";

import { createPageBody, PageSurface, createPageDataSection } from "@workspace/core/ui";

interface ImportResultProps {
  success: boolean;
  message: string;
}

export default function ImportResult({ success, message }: ImportResultProps) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageDataSection("import-result", {
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
