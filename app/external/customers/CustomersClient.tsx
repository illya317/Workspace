"use client";

import { useState } from "react";
import { ActionToolbar, EmptyStateCard, PageContent, SectionCard } from "@workspace/core/ui";
import type { Customer } from "../types";

export default function CustomersClient() {
  const [_customers, _setCustomers] = useState<Customer[]>([]);
  const [_loading, _setLoading] = useState(false);

  return (
    <PageContent className="py-10">
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
    </PageContent>
  );
}
