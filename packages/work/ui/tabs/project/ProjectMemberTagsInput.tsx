"use client";

import {
  ActionButton,
  FkFieldInput,
  getTagInputShellClassName,
  getTagPillClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { dedupeMembers, employeeFromOption, type EmployeeTag } from "./model";

export default function ProjectMemberTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: EmployeeTag[];
  disabled?: boolean;
  onChange: (value: EmployeeTag[]) => void;
}) {
  function add(option?: FkFieldOption) {
    const employee = employeeFromOption(option);
    if (!employee) return;
    onChange(dedupeMembers([...value, employee]));
  }

  function remove(id: number) {
    onChange(value.filter((member) => member.id !== id));
  }

  return (
    <div className={getTagInputShellClassName()}>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((member) => (
          <span
            key={member.id}
            className={getTagPillClassName("gap-2 px-3 text-sm text-slate-700")}
          >
            {member.name}
            {!disabled && (
              <ActionButton
                aria-label={`移除${member.name}`}
                onClick={() => remove(member.id)}
                className="border-0 bg-transparent p-0 text-slate-400 shadow-none hover:text-red-500"
              >
                x
              </ActionButton>
            )}
          </span>
        ))}
        {!disabled && (
          <div className="min-w-48 flex-1">
            <FkFieldInput
              fkKey="work.plan.member.employee"
              value=""
              placeholder={value.length ? "继续添加" : "搜索员工"}
              onChange={(_label, option) => add(option)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
