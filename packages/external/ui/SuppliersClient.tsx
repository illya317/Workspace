"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";

export default function SuppliersClient() {
  return (
    <PageSurface kind="standard"
      toolbar={{
        items: [
          {
            kind: "create",
            key: "add-supplier",
            label: "新增供应商",
            disabled: true,
            onClick: () => {},
          },
        ],
      }}
      body={createPageBody([
        createSectionSection("suppliers", {
          title: "供应商列表",
          sections: [
            createStatusSection("empty", { kind: "empty", content: "暂无供应商数据" }),
          ],
        }),
      ])}
    />
  );
}
