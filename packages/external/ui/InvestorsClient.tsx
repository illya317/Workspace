"use client";

import { ActionToolbar, EmptyStateCard, SectionCard } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

export default function InvestorsClient() {
  return (
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="投资人列表"
        actions={
          <ActionToolbar
            primaryActions={[{ label: "新增投资人", kind: "add", disabled: true, variant: "primary" }]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无投资人数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
