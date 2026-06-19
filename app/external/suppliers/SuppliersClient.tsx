"use client";

import { useState } from "react";
import { ActionToolbar, EmptyStateCard, PageContent, SectionCard } from "@workspace/core/ui";
import type { Supplier } from "../types";

export default function SuppliersClient() {
  const [_suppliers, _setSuppliers] = useState<Supplier[]>([]);
  const [_loading, _setLoading] = useState(false);

  return (
    <PageContent className="py-10">
      <SectionCard
        title="供应商列表"
        actions={
          <ActionToolbar
            primaryActions={[{ label: "新增供应商", disabled: true, variant: "primary" }]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无供应商数据</EmptyStateCard>
      </SectionCard>
    </PageContent>
  );
}
