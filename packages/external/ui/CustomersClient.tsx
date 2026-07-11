"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";

export default function CustomersClient() {
  return (
    <PageSurface kind="standard"
      body={createPageBody([
        createSectionSection("customers", {
          title: "客户列表",
          sections: [
            createStatusSection("empty", { kind: "empty", content: "暂无客户数据" }),
          ],
        }),
      ])}
    />
  );
}
