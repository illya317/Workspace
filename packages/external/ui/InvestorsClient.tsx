"use client";

import { createPageBody, createRecordSection, createSectionSection, PageSurface } from "@workspace/core/ui";

export default function InvestorsClient() {
  return (
    <PageSurface kind="standard"
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
      body={createPageBody([
        createSectionSection("investors", {
          title: "投资人列表",
          sections: [
            createRecordSection("empty", { records: [], empty: "暂无投资人数据" }),
          ],
        }),
      ])}
    />
  );
}
