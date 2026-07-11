"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";

export default function InvestorsClient() {
  return (
    <PageSurface kind="standard"
      body={createPageBody([
        createSectionSection("investors", {
          title: "投资人列表",
          sections: [
            createStatusSection("empty", { kind: "empty", content: "暂无投资人数据" }),
          ],
        }),
      ])}
    />
  );
}
