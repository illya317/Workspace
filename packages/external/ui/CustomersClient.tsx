"use client";

import { PageSurface } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";

export default function CustomersClient() {
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "icon-button",
      key: "add-customer",
      section: "action",
      icon: "add",
      label: "新增客户",
      variant: "primary",
      disabled: true,
    },
  ];

  return (
    <PageSurface
      kind="list"
      contentClassName="py-10"
      toolbar={{ items: toolbarItems, className: "p-4" }}
      blocks={[
        {
          kind: "section",
          key: "customers",
          title: "客户列表",
          blocks: [
            {
              kind: "data",
              key: "empty",
              surface: {
                kind: "records",
                records: [],
                empty: "暂无客户数据",
              },
            },
          ],
        },
      ]}
    />
  );
}
