"use client";

import { ActionToolbar, EmptyStateCard, SectionCard } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

export default function CustomersClient() {
  return (
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="客户列表"
        actions={
          <ActionToolbar
            primaryActions={[{ label: "新增客户", disabled: true, variant: "primary" }]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无客户数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
