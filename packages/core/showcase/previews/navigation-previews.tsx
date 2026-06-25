"use client";

import { useState, type FC } from "react";
import {
  AccordionTabBar,
  DisclosureSectionHeader,
  Pagination,
  TabBar,
} from "@workspace/core/ui";

function AccordionTabBarPreview() {
  const [activeTab, setActiveTab] = useState("hr");
  const [activeChild, setActiveChild] = useState("roster");
  return (
    <AccordionTabBar
      tabs={[
        {
          key: "hr",
          label: "人事",
          children: [
            { key: "roster", label: "花名册" },
            { key: "fields", label: "字段维护" },
            { key: "import", label: "导入" },
          ],
        },
        {
          key: "finance",
          label: "财务",
          children: [
            { key: "subjects", label: "科目" },
            { key: "vouchers", label: "凭证" },
          ],
        },
        { key: "work", label: "工作" },
      ]}
      activeTab={activeTab}
      activeChild={activeChild}
      onTabChange={setActiveTab}
      onChildChange={setActiveChild}
    />
  );
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
