"use client";

import { useState } from "react";
import { ActionButton, IconActionButton } from "../ActionControls";
import { PanelCard } from "../BaseCards";
import CommandToolbar from "../CommandToolbar";
import EditToolbar from "../EditToolbar";
import FormField from "../FormField";
import SearchInput from "../SearchInput";
import SelectorCard from "../SelectorCard";
import SplitWorkspace from "../SplitWorkspace";
import StatusBadge from "../StatusBadge";
import TextField from "../TextField";
import { departmentItems } from "./hr-preview-schema";

function DepartmentSide() {
  return (
    <PanelCard title="部门岗位架构" bodyClassName="space-y-2 p-3">
      {departmentItems.map((item, index) => (
        <SelectorCard
          key={item.title}
          title={item.title}
          subtitle={item.subtitle}
          active={index === 0}
          onClick={() => {}}
        />
      ))}
    </PanelCard>
  );
}

function DepartmentToolbar({ sideOpen, onToggleSide }: { sideOpen: boolean; onToggleSide: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [editMode, setEditMode] = useState(false);

  return (
    <CommandToolbar
      viewControls={(
        <>
          <IconActionButton label={sideOpen ? "隐藏" : "显示"} variant={sideOpen ? "primary" : "secondary"} onClick={onToggleSide}>
            ☰
          </IconActionButton>
          <IconActionButton label="新建部门" variant="primary">
            +
          </IconActionButton>
        </>
      )}
      filters={(
        <>
          <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索部门" size="toolbar" />
          <ActionButton>全部展开</ActionButton>
          <ActionButton>全部收起</ActionButton>
        </>
      )}
      selectionActions={<ActionButton>新建岗位</ActionButton>}
      editActions={(
        <EditToolbar
          editMode={editMode}
          onStartEdit={() => setEditMode(true)}
          onSave={async () => setEditMode(false)}
          onCancel={() => setEditMode(false)}
          onShowHistory={() => {}}
        />
      )}
      meta={<span>共 12 部门</span>}
    />
  );
}

export default function EmployeeDepartmentPreview() {
  const [sideOpen, setSideOpen] = useState(true);

  return (
    <div className="space-y-3">
      <DepartmentToolbar sideOpen={sideOpen} onToggleSide={() => setSideOpen((value) => !value)} />
      <SplitWorkspace
        sideOpen={sideOpen}
        drawerOpen={false}
        onDrawerOpenChange={() => {}}
        renderSide={() => <DepartmentSide />}
      >
        <PanelCard
          title="部门信息"
          actions={(
            <div className="flex items-center gap-2">
              <ActionButton>归档部门</ActionButton>
              <ActionButton variant="primary">保存部门信息</ActionButton>
            </div>
          )}
          bodyClassName="space-y-4 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="部门编码">
              <TextField value="EXC001" readOnly />
            </FormField>
            <FormField label="完整路径 / 部门名称">
              <TextField value="轮执委员会" readOnly />
            </FormField>
            <FormField label="部门负责人">
              <SearchInput value="" onChange={() => {}} placeholder="搜索负责人" size="compact" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <span>直属岗位 4</span>
            <span>总岗位 8</span>
            <span>直属编制 1</span>
            <span>总编制 3</span>
            <StatusBadge label="现用" variant="green" />
          </div>
        </PanelCard>
      </SplitWorkspace>
    </div>
  );
}
