"use client";

import { createPageBody, createRecordSection, createSectionSection, PageSurface } from "@workspace/core/ui";

export default function SuppliersClient() {
  return (
    <PageSurface kind="standard"
      toolbar={{
        items: [
          {
            kind: "icon-button",
            key: "add-supplier",
            icon: "add",
            label: "新增供应商",
            disabled: true,
            variant: "primary",
          },
        ],
      }}
      body={createPageBody([
        createSectionSection("suppliers", {
          title: "供应商列表",
          sections: [
            createRecordSection("empty", { records: [], empty: "暂无供应商数据" }),
          ],
        }),
      ])}
    />
  );
}
