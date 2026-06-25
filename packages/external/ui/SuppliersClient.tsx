"use client";

import { EmptyStateCard, SectionCard, Toolbar } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

export default function SuppliersClient() {
  return (
    <DatabasePageFrame contentClassName="py-10">
      <SectionCard
        title="供应商列表"
        actions={
          <Toolbar
            variant="inline"
            items={[
              {
                kind: "icon-button",
                key: "add-supplier",
                icon: "add",
                label: "新增供应商",
                disabled: true,
                variant: "primary",
              },
            ]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无供应商数据</EmptyStateCard>
      </SectionCard>
    </DatabasePageFrame>
  );
}
