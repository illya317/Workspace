"use client";

import { useState } from "react";
import { ActionToolbar, EmptyStateCard, PageContent, SectionCard } from "@workspace/core/ui";
import type { Investor } from "../types";

export default function InvestorsClient() {
  const [_investors, _setInvestors] = useState<Investor[]>([]);
  const [_loading, _setLoading] = useState(false);

  return (
    <PageContent className="py-10">
      <SectionCard
        title="投资人列表"
        actions={
          <ActionToolbar
            primaryActions={[{ label: "新增投资人", disabled: true, variant: "primary" }]}
          />
        }
      >
        <EmptyStateCard compact={false}>暂无投资人数据</EmptyStateCard>
      </SectionCard>
    </PageContent>
  );
}
