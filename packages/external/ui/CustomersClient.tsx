"use client";

import { DatabasePageFrame, EmptyStateCard, SectionCard, Toolbar, type ToolbarItem } from "@workspace/core/ui";

export default function CustomersClient() {
  const toolbarItems: ToolbarItem[] = [
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
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="客户列表"
        actions={<Toolbar items={toolbarItems} className="p-4" />}
      >
        <EmptyStateCard compact={false}>暂无客户数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
