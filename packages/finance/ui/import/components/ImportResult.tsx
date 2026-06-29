"use client";

import { createPageBody, PageSurface, createMetricsSection } from "@workspace/core/ui";

interface ImportResultProps {
  success: boolean;
  message: string;
}

export default function ImportResult({ success, message }: ImportResultProps) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createMetricsSection("import-result", {


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
