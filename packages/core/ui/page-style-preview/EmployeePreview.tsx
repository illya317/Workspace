"use client";

import { useState } from "react";
import { ActionButton } from "../ActionControls";
import DataTable, { type DataTableColumn } from "../DataTable";
import InlineCreatePanel from "../InlineCreatePanel";
import Pagination from "../Pagination";
import StatusBadge from "../StatusBadge";
import TextField from "../TextField";
import EmployeeAssignmentPreview from "./EmployeeAssignmentPreview";
import EmployeeDepartmentPreview from "./EmployeeDepartmentPreview";
import EmployeeOrgTreePreview from "./EmployeeOrgTreePreview";
import EmployeeProfilePreview from "./EmployeeProfilePreview";
import PreviewToolbar from "./PreviewToolbar";

type Row = {
  id: string;
  code: string;
  name: string;
  department: string;
  status: "在职" | "离职";
};

const rows: Row[] = [
  { id: "1", code: "E-001", name: "张明", department: "生产中心", status: "在职" },
  { id: "2", code: "E-018", name: "李青", department: "质量部", status: "在职" },
  { id: "3", code: "E-092", name: "王岚", department: "行政部", status: "离职" },
];

const columns: DataTableColumn<Row>[] = [
  { key: "code", label: "员工编号", required: true, render: (row) => row.code },
  { key: "name", label: "姓名", required: true, render: (row) => <strong>{row.name}</strong> },
  { key: "department", label: "部门", defaultVisible: true, render: (row) => row.department },
  {
    key: "status",
    label: "状态",
    defaultVisible: true,
    render: (row) => <StatusBadge label={row.status} variant={row.status === "在职" ? "green" : "gray"} />,
  },
];

export default function EmployeePreview({ activeChild }: { activeChild: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  if (activeChild === "profile") return <EmployeeProfilePreview />;
  if (activeChild === "assignment") return <EmployeeAssignmentPreview />;
  if (activeChild === "department") return <EmployeeDepartmentPreview />;
  if (activeChild === "tree") return <EmployeeOrgTreePreview />;

  return (
    <div className="space-y-3">
      <PreviewToolbar onCreate={() => setCreateOpen((value) => !value)} />
      {createOpen && (
        <InlineCreatePanel
          title="快速新建员工"
          submitLabel="确认"
          fieldsClassName="grid gap-2 md:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_auto]"
          onSubmit={() => {}}
          onCancel={() => setCreateOpen(false)}
        >
          <TextField placeholder="姓名" />
          <TextField placeholder="员工编码" />
        </InlineCreatePanel>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <DataTable rows={rows} columns={columns} visibleColumns={["department", "status"]} rowKey={(row) => row.id} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <ActionButton>批量导出</ActionButton>
        <Pagination page={page} totalPages={8} total={343} onPageChange={setPage} />
      </div>
    </div>
  );
}
