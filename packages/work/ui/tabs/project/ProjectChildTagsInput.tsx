"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  RemovableTag,
  SearchableOptionInput,
  getTagInputShellClassName,
} from "@workspace/core/ui";
import type { SearchableOption } from "@workspace/core/ui";

type ProjectChildTag = {
  id: number;
  name: string;
};

export default function ProjectChildTagsInput({
  value,
  options,
  disabled,
  onChange,
}: {
  value: ProjectChildTag[];
  options: SearchableOption[];
  disabled?: boolean;
  onChange: (value: ProjectChildTag[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
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

  function add(option?: SearchableOption) {
    const id = option ? Number(option.value) : Number.NaN;
    if (!Number.isInteger(id) || value.some((project) => project.id === id)) return;
    onChange([...value, { id, name: option?.label || String(id) }]);
    setPickerKey((key) => key + 1);
    setPickerOpen(false);
  }

  function remove(id: number) {
    onChange(value.filter((project) => project.id !== id));
  }

  return (
    <div className={getTagInputShellClassName("relative")}>
      <div className="flex min-h-6 w-full flex-wrap items-center gap-2">
        {value.map((project) => (
          <RemovableTag
            key={project.id}
            label={`移除下级项目 ${project.name}`}
            confirmMessage={`确定从当前项目下移除「${project.name}」吗？保存后生效。`}
            disabled={disabled}
            onRemove={() => remove(project.id)}
          >
            {project.name}
          </RemovableTag>
        ))}
        {!disabled && (
          <div ref={pickerRef} className="relative">
            <ActionButton
              aria-label="添加下级项目"
              title="添加下级项目"
              onClick={() => setPickerOpen((open) => !open)}
              className="!grid !size-6 !place-items-center rounded-full !border-sky-200 !bg-sky-50 !p-0 text-base font-semibold leading-none !text-sky-700 hover:!border-sky-300 hover:!bg-sky-100"
            >
              +
            </ActionButton>
            {pickerOpen && (
              <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-80 border border-slate-200 bg-slate-50/95 p-2 shadow-xl">
                <SearchableOptionInput
                  key={pickerKey}
                  value=""
                  options={options}
                  placeholder="搜索项目"
                  emptyText="无可选项目"
                  className="!w-full"
                  onChange={(_value, option) => add(option)}
                />
              </div>
            )}
          </div>
        )}
        {value.length === 0 && <span className="text-sm text-slate-400">暂无下级项目</span>}
      </div>
    </div>
  );
}
