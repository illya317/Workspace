"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";

export default function CustomersClient() {
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "icon-button",
      key: "add-customer",
      icon: "add",
      label: "新增客户",
      variant: "primary",
      disabled: true,
    },
  ];

  return (
    <PageSurface kind="standard"
      toolbar={{ items: toolbarItems }}
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
