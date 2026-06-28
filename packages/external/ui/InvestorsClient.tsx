"use client";

import { createSectionBlock, PageSurface } from "@workspace/core/ui";

export default function InvestorsClient() {
  return (
    <PageSurface
      kind="list"
      contentClassName="py-10"
      toolbar={{
        items: [
          {
            kind: "icon-button",
            key: "add-investor",
            section: "action",
            icon: "add",
            label: "新增投资人",
            variant: "primary",
            disabled: true,
          },
        ],
      }}
      blocks={[
        createSectionBlock("investors", {
          title: "投资人列表",
          blocks: [
            {
              kind: "data",
              key: "empty",
              surface: {
                kind: "records",
                records: [],
                empty: "暂无投资人数据",
              },
            },
          ],
        }),
      ]}
    />
  );
}
