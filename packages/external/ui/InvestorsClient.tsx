"use client";

import { EmptyStateCard, SectionCard, Toolbar } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

export default function InvestorsClient() {
  return (
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="投资人列表"
        actions={
          <Toolbar
            items={[
              {
                kind: "icon-button",
                key: "add-investor",
                section: "action",
                icon: "add",
                label: "新增投资人",
                variant: "primary",
                disabled: true,
              },
            ]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无投资人数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
