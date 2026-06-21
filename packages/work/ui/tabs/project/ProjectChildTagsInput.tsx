"use client";

import { useState } from "react";
import {
  ActionButton,
  FkFieldInput,
  FormField,
  CalendarDateInput,
  InlineCreatePanel,
  RemovableTag,
  TextField,
  getTagInputShellClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { employeeFromOption, type EmployeeTag } from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

type ProjectChildTag = {
  id: number;
  name: string;
};

export default function ProjectChildTagsInput({
  value,
  disabled,
  creating,
  onChange,
  onCreate,
}: {
  value: ProjectChildTag[];
  disabled?: boolean;
  creating?: boolean;
  onChange: (value: ProjectChildTag[]) => void;
  onCreate: (name: string, leadingDepartmentId?: number | null, leader?: EmployeeTag | null, endDate?: string | null) => Promise<void> | void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [leadingDepartment, setLeadingDepartment] = useState<{ id: number; name: string } | null>(null);
  const [leader, setLeader] = useState<EmployeeTag | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  function remove(id: number) {
    onChange(value.filter((project) => project.id !== id));
  }

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName || creating) return;
    await onCreate(trimmedName, leadingDepartment?.id ?? null, leader, endDate);
    setName("");
    setLeadingDepartment(null);
    setLeader(null);
    setEndDate(null);
    setCreateOpen(false);
  }

  function updateLeader(option?: FkFieldOption) {
    setLeader(employeeFromOption(option));
  }

  function updateLeadingDepartment(option?: FkFieldOption) {
    setLeadingDepartment(option ? { id: option.id, name: option.name } : null);
  }

  return (
    <div className={getTagInputShellClassName("relative items-start")}>
      <div className="flex min-h-6 w-full flex-wrap items-center gap-2">
        {value.map((project) => (
          <RemovableTag
            key={project.id}
            label={`移除子项目 ${project.name}`}
            confirmMessage={`确定从当前项目下移除「${project.name}」吗？保存后生效。`}
            disabled={disabled}
            onRemove={() => remove(project.id)}
          >
            {project.name}
          </RemovableTag>
        ))}
        {!disabled && (
          <div className="relative">
            <ActionButton
              aria-label="新建子项目"
              title="新建子项目"
              onClick={() => setCreateOpen((open) => !open)}
              className="!grid !size-6 !place-items-center rounded-full !border-sky-200 !bg-sky-50 !p-0 text-base font-semibold leading-none !text-sky-700 hover:!border-sky-300 hover:!bg-sky-100"
            >
              +
            </ActionButton>
          </div>
        )}
        {value.length === 0 && <span className="text-sm text-slate-400">暂无子项目</span>}
      </div>
      {createOpen && !disabled && (
        <InlineCreatePanel
          title="新建子项目"
          hideTitle
          submitting={creating}
          submitDisabled={!name.trim()}
          onSubmit={() => void submit()}
          onCancel={() => {
            setName("");
            setLeadingDepartment(null);
            setLeader(null);
            setEndDate(null);
            setCreateOpen(false);
          }}
          className="mt-3 w-full"
        >
          <FormField label="项目名称" required layout="inline" className="w-72">
            <TextField
              value={name}
              disabled={creating}
              placeholder="子项目名称"
              onChange={setName}
              className="h-9"
              autoFocus
            />
          </FormField>
          <FormField label="主导部门" layout="inline" className="w-72">
            <FkFieldInput
              fkKey="work.projects.leadingDepartment"
              endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
              value={leadingDepartment ? String(leadingDepartment.id) : ""}
              displayValue={leadingDepartment?.name || ""}
              disabled={creating}
              placeholder="搜索部门"
              onChange={(_label, option) => updateLeadingDepartment(option)}
            />
          </FormField>
          <FormField label="负责人" layout="inline" className="w-72">
            <FkFieldInput
              fkKey="work.projects.member.employee"
              endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
              value={leader?.employeeNumber || ""}
              displayValue={leader?.name || ""}
              disabled={creating}
              placeholder="搜索负责人"
              onChange={(_label, option) => updateLeader(option)}
            />
          </FormField>
          <FormField label="结束日期" layout="inline" className="w-56">
            <CalendarDateInput
              value={endDate}
              disabled={creating}
              onChange={setEndDate}
              className="h-9"
            />
          </FormField>
        </InlineCreatePanel>
      )}
    </div>
  );
}
