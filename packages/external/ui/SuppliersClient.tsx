"use client";

import { createPageBody, createSectionBlock, PageSurface } from "@workspace/core/ui";

export default function SuppliersClient() {
  return (
    <PageSurface
      kind="list"
      contentClassName="py-10"
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
        createSectionBlock("suppliers", {
          title: "供应商列表",
          blocks: [
            {
              kind: "data",
              key: "empty",
              surface: {
                kind: "records",
                records: [],
                empty: "暂无供应商数据",
              },
            },
          ],
        }),
      ])}
    />
  );
}
