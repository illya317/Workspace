"use client";

import { useState, type FC } from "react";
import {
  DisclosureSectionHeader,
  Pagination,
  TabBar,
} from "@workspace/core/ui";

function AccordionTabBarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">AccordionTabBar</p><p>横版手风琴 Tab，一级 Tab 在 Toolbar 上方；选中含子项的 Tab 时横向展开子 Tab。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function DisclosureSectionHeaderPreview() {
  const [disclosureExpanded, setDisclosureExpanded] = useState<boolean>(false);
  return (
    <div className="flex flex-col gap-2">
      <DisclosureSectionHeader
        title="日常工作"
        count={3}
        expanded={disclosureExpanded}
        onToggle={() => setDisclosureExpanded((v) => !v)}
      />
      {disclosureExpanded && (
        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          展开后显示的内容区域
        </div>
      )}
    </div>
  );
}

function PaginationPreview() {
  const [page, setPage] = useState(3);
  return <Pagination page={page} totalPages={8} total={76} onPageChange={setPage} />;
}

function TabBarPreview() {
  const [active, setActive] = useState("subject");
  return (
    <TabBar
      active={active}
      onChange={setActive}
      tabs={[
        { key: "subject", label: "科目设置" },
        { key: "voucher", label: "凭证明细" },
        { key: "balance", label: "余额表" },
      ]}
    />
  );
}

export const navigationPreviewByName: Record<string, FC> = {
  AccordionTabBar: AccordionTabBarPreview,
  DisclosureSectionHeader: DisclosureSectionHeaderPreview,
  Pagination: PaginationPreview,
  TabBar: TabBarPreview,
};
