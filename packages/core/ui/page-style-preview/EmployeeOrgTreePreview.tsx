"use client";

import { useState } from "react";
import { ActionButton } from "../ActionControls";
import { PanelCard } from "../BaseCards";
import CommandToolbar from "../CommandToolbar";
import { TreeNodeBranch, TreeNodeCard } from "../HierarchyTree";
import SearchInput from "../SearchInput";

export default function EmployeeOrgTreePreview() {
  const [keyword, setKeyword] = useState("");

  return (
    <div className="space-y-3">
      <CommandToolbar
        filters={<SearchInput value={keyword} onChange={setKeyword} placeholder="搜索部门" size="toolbar" />}
        selectionActions={(
          <>
            <ActionButton>全部展开</ActionButton>
            <ActionButton>全部收起</ActionButton>
          </>
        )}
        meta={<span>已展开 3 层</span>}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <PanelCard title="一级部门" bodyClassName="space-y-2 p-3">
          <TreeNodeCard title="轮执委员会" code="EXC001" level={1} active meta="岗 直属 4 · 总 8" />
          <TreeNodeCard title="职能事业部平台" code="FUN001" level={1} meta="岗 直属 0 · 总 83" />
        </PanelCard>
        <PanelCard title="下级组织" bodyClassName="space-y-2 p-3">
          <TreeNodeCard title="轮执委员会" code="EXC001" level={1} active meta="直属部门 2 · 直属岗位 4" />
          <TreeNodeBranch>
            <TreeNodeCard title="董秘办及资本证..." code="EXC100" level={2} meta="直属岗位 4 · 总岗位 4" />
            <TreeNodeCard title="行政人事部" code="FUN100" level={2} meta="直属岗位 5 · 总岗位 24" />
          </TreeNodeBranch>
        </PanelCard>
      </div>
    </div>
  );
}
