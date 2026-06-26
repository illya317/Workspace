"use client";

import { useEffect, useRef, useState } from "react";
import { CommandButton, InputControl, TagListInput } from "@workspace/core/ui";
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
    <TagListInput
      items={value}
      getKey={(member) => member.id}
      getLabel={(member) => member.name}
      onRemove={(member) => remove(member.id)}
      disabled={disabled}
      confirmMessage={(member) => `确定删除项目人员「${member.name}」吗？删除后需要保存才会生效。`}
      itemTitle={(member) => (member.confirmationStatus === "pending" ? `${member.name}：待确认` : member.name)}
      itemClassName={(member) =>
        member.confirmationStatus === "pending"
          ? "!border-amber-200 !bg-amber-50 !text-amber-800 shadow-amber-100"
          : ""
      }
      append={
        !disabled && (
          <div ref={pickerRef} className="relative">
            <CommandButton
              aria-label="添加项目人员"
              title="添加项目人员"
              onClick={() => setPickerOpen((open) => !open)}
              size="sm"
              className="!size-6 !rounded-full !border-slate-200 !bg-slate-50 !p-0 text-base font-semibold leading-none !text-slate-700 hover:!border-slate-300 hover:!bg-slate-100"
            >
              +
            </CommandButton>
            {pickerOpen && (
              <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-72 border border-slate-200 bg-slate-50/95 p-2 shadow-xl">
                <InputControl
                  spec={{
                    valueType: "reference",
                    editor: "autocomplete",
                    options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
                  }}
                  value=""
                  placeholder="搜索员工"
                  className="w-full"
                  onChange={(_label, option) => add(option as FkFieldOption | undefined)}
                />
              </div>
            )}
          </div>
        )
      }
    />
  );
}
