"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  FkFieldInput,
  RemovableTag,
  getTagInputShellClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { dedupeMembers, employeeFromOption, type EmployeeTag } from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

export default function ProjectMemberTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: EmployeeTag[];
  disabled?: boolean;
  onChange: (value: EmployeeTag[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current?.contains(event.target as Node)) return;
      setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  function add(option?: FkFieldOption) {
    const employee = employeeFromOption(option);
    if (!employee) return;
    onChange(dedupeMembers([...value, employee]));
    setPickerOpen(false);
  }

  function remove(id: number) {
    onChange(value.filter((member) => member.id !== id));
  }

  return (
    <div className={getTagInputShellClassName("relative")}>
      <div className="flex min-h-6 w-full flex-wrap items-center gap-2">
        {value.map((member) => (
          <RemovableTag
            key={member.id}
            label={`删除项目人员 ${member.name}`}
            confirmMessage={`确定删除项目人员「${member.name}」吗？删除后需要保存才会生效。`}
            disabled={disabled}
            title={member.confirmationStatus === "pending" ? `${member.name}：待确认` : member.name}
            className={member.confirmationStatus === "pending" ? "!border-amber-200 !bg-amber-50 !text-amber-800 shadow-amber-100" : ""}
            onRemove={() => remove(member.id)}
          >
            {member.name}
          </RemovableTag>
        ))}
        {!disabled && (
          <div ref={pickerRef} className="relative">
            <ActionButton
              aria-label="添加项目人员"
              title="添加项目人员"
              onClick={() => setPickerOpen((open) => !open)}
              className="!grid !size-6 !place-items-center rounded-full !border-sky-200 !bg-sky-50 !p-0 text-base font-semibold leading-none !text-sky-700 hover:!border-sky-300 hover:!bg-sky-100"
            >
              +
            </ActionButton>
            {pickerOpen && (
              <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-72 border border-slate-200 bg-slate-50/95 p-2 shadow-xl">
                <FkFieldInput
                  fkKey="work.projects.member.employee"
                  endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
                  value=""
                  placeholder="搜索员工"
                  className="!w-full"
                  onChange={(_label, option) => add(option)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
