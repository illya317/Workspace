"use client";

import { ActionToolbar, EmptyStateCard, SectionCard } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

export default function SuppliersClient() {
  return (
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="供应商列表"
        actions={
          <ActionToolbar
            primaryActions={[{ label: "新增供应商", kind: "add", disabled: true, variant: "primary" }]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无供应商数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
