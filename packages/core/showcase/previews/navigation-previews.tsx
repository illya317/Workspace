"use client";

import { useState, type FC } from "react";
import {
  DisclosureSectionHeader,
  NavigationSurface,
  Pagination,
  TabBar,
  ToolbarOptionGroup,
} from "../internal-ui";

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

function NavigationSurfacePreview() {
  const [active, setActive] = useState("basic");
  return (
    <NavigationSurface
      kind="steps"
      active={active}
      onChange={setActive}
      steps={[
        { key: "basic", label: "基础" },
        { key: "fields", label: "字段" },
        { key: "confirm", label: "确认" },
      ]}
    />
  );
}

function TabBarPreview() {
  const [largeActive, setLargeActive] = useState("hr");
  const [largeChild, setLargeChild] = useState("roster");
  const [mid, setMid] = useState("subject");
  const [smallActive, setSmallActive] = useState("reclass");
  const [smallChild, setSmallChild] = useState("configured");
  const [microAccordion, setMicroAccordion] = useState("all");
  const [withActionsActive, setWithActionsActive] = useState("basic");

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-slate-400">large + accordion + trailingActions</p>
        <TabBar
          ariaLabel="页面标签预览"
          variant="large"
          accordion
          className="max-w-full"
          active={withActionsActive}
          onChange={setWithActionsActive}
          tabs={[
            { key: "basic", label: "基本信息" },
            { key: "employment", label: "雇佣关系" },
            { key: "edp", label: "部门岗位" },
            { key: "history", label: "历史记录" },
          ]}
          trailingActions={[
            {
              key: "save",
              icon: "save",
              label: "保存",
              variant: "primary",
              onClick: () => {},
            },
            {
              key: "back",
              icon: "cancel",
              label: "返回",
              variant: "secondary",
              onClick: () => {},
            },
          ]}
        />
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-slate-400">large + accordion</p>
        <TabBar
          ariaLabel="页面标签预览"
          variant="large"
          accordion
          className="max-w-full"
          active={largeActive}
          activeChild={largeChild}
          onChange={setLargeActive}
          onChildChange={setLargeChild}
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
        />
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-slate-400">mid</p>
        <TabBar
          ariaLabel="页内标签预览"
          variant="mid"
          active={mid}
          onChange={setMid}
          className="mb-0 max-w-full"
          tabs={[
            { key: "subject", label: "科目设置" },
            { key: "voucher", label: "凭证明细" },
            { key: "balance", label: "余额表" },
            { key: "mapping", label: "映射关系" },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">small + accordion</p>
          <TabBar
            ariaLabel="工具栏手风琴预览"
            variant="small"
            accordion
            active={smallActive}
            activeChild={smallChild}
            onChange={setSmallActive}
            onChildChange={setSmallChild}
            tabs={[
              {
                key: "reclass",
                label: "重分类",
                children: [
                  { key: "configured", label: "已配置 12" },
                  { key: "unconfigured", label: "未配置 3" },
                  { key: "all", label: "全部 15" },
                ],
              },
            ]}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">micro + accordion (toolbar)</p>
          <ToolbarOptionGroup
            ariaLabel="改造状态"
            presentation="accordion"
            value={microAccordion}
            onChange={setMicroAccordion}
            options={[
              { value: "all", label: <>全部 <span className="text-slate-400">15</span></> },
              { value: "configured", label: <>已配置 <span className="text-slate-400">12</span></> },
              { value: "unconfigured", label: <>未配置 <span className="text-slate-400">3</span></> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export const navigationPreviewByName: Record<string, FC> = {
  DisclosureSectionHeader: DisclosureSectionHeaderPreview,
  NavigationSurface: NavigationSurfacePreview,
  Pagination: PaginationPreview,
  TabBar: TabBarPreview,
};
