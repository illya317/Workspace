"use client";

import { CommandButton, EmptyStateCard, FormField, PanelCard, TagListInput, TextField, useConfirmDelete } from "@workspace/core/ui";
import { normalizeHrMajorItems, type HRMajorItem } from "@workspace/hr/constants/field-options";
import { OptionPicker } from "@workspace/core/ui";
import MajorPicker from "../../components/MajorPicker";
import { ENVIRONMENT_FACTOR_OPTIONS, WORK_AREA_OPTIONS, pickerOptions, primitiveListItems } from "./description-details";
import { OptionTagListEditor } from "./detail-editor-primitives";
type WorkEnvironmentItem = {
  area: string;
  factors: string[];
};
function normalizeWorkEnvironments(value: unknown): WorkEnvironmentItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const area = String(record.area || "").trim();
    if (!area) return null;
    return {
      area,
      factors: primitiveListItems(record.factors)
    };
  }).filter((item): item is WorkEnvironmentItem => Boolean(item));
}
export function WorkEnvironmentEditor({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: WorkEnvironmentItem[]) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const items = normalizeWorkEnvironments(value);
  const usedAreas = new Set(items.map(item => item.area));
  const availableAreas = WORK_AREA_OPTIONS.filter(area => !usedAreas.has(area));
  function updateItem(index: number, patch: Partial<WorkEnvironmentItem>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      ...patch
    } : item));
  }
  function addArea(area: string | null) {
    if (!area) return;
    onChange([...items, {
      area,
      factors: []
    }]);
  }
  async function removeArea(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除工作区域「${items[index]?.area || "未设置"}」吗？删除后需要保存才会生效。`
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  return <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <PanelCard bodyClassName="space-y-3 p-3">
        {items.map((item, index) => {
        const areaOptions = [item.area, ...availableAreas].filter((area, areaIndex, array) => array.indexOf(area) === areaIndex);
        return <PanelCard key={`${item.area}-${index}`} bodyClassName="p-3">
              <div className="mb-3 flex items-start gap-3">
                <div className="min-w-48 flex-1">
                  <OptionPicker value={item.area} options={pickerOptions(areaOptions)} disabled={disabled} placeholder="选择工作区域" searchPlaceholder="搜索工作区域" onChange={next => updateItem(index, {
                area: next || ""
              })} />
                </div>
                {!disabled && <CommandButton aria-label={`删除工作区域 ${item.area}`} onClick={() => void removeArea(index)} variant="danger" size="sm" className="grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500">
                    ×
                  </CommandButton>}
              </div>
              <OptionTagListEditor label="环境因素" value={item.factors} options={ENVIRONMENT_FACTOR_OPTIONS} disabled={disabled} placeholder="添加环境因素" onChange={factors => updateItem(index, {
            factors
          })} />
            </PanelCard>;
      })}
        {items.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
        {!disabled && <div className="max-w-sm">
            <OptionPicker value="" options={pickerOptions(availableAreas)} disabled={availableAreas.length === 0} placeholder="新增工作区域" searchPlaceholder="搜索工作区域" onChange={addArea} />
          </div>}
      </PanelCard>
    </div>;
}
type ExperienceRequirementItem = {
  years: string;
  requirement: string;
};
function normalizeExperienceRequirements(value: unknown): ExperienceRequirementItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    return {
      years: String(record.years || "").trim(),
      requirement: String(record.requirement || "").trim()
    };
  }).filter((item): item is ExperienceRequirementItem => Boolean(item && (item.years || item.requirement)));
}
function positiveIntegerText(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}
export function MajorRequirementsEditor({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: HRMajorItem[]) => void;
}) {
  const items = normalizeHrMajorItems(value);
  function addItem(next: string | null) {
    const selected = normalizeHrMajorItems(next)[0] ?? {
      category: "待选择",
      specialty: ""
    };
    if (!selected.specialty) return;
    const nextItems = [...items.filter(item => item.specialty !== selected.specialty), selected];
    onChange(nextItems);
  }
  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <TagListInput
        items={items}
        getKey={(item, index) => `${item.category}-${item.specialty}-${index}`}
        getLabel={(item) => item.specialty || item.category}
        onRemove={(_, index) => removeItem(index)}
        disabled={disabled}
        confirmMessage={(item) => `确定删除专业要求「${item.category || ""}${item.specialty ? ` / ${item.specialty}` : ""}」吗？删除后需要保存才会生效。`}
        itemTitle={(item) => (item.category ? `${item.category} / ${item.specialty}` : item.specialty)}
        emptyText={disabled ? "未设置" : undefined}
        shellClassName="content-start"
      >
        {!disabled && (
          <div className="min-w-40 flex-1">
            <MajorPicker value="" disabled={disabled} onChange={addItem} />
          </div>
        )}
      </TagListInput>
    </div>
  );
}
export function ExperienceRequirementsEditor({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: ExperienceRequirementItem[]) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const items = normalizeExperienceRequirements(value);
  function updateItem(index: number, patch: Partial<ExperienceRequirementItem>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      ...patch
    } : item));
  }
  function addItem() {
    onChange([...items, {
      years: "1",
      requirement: ""
    }]);
  }
  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index]?.requirement || label}」吗？删除后需要保存才会生效。`
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  return <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {!disabled && <CommandButton onClick={addItem} size="sm" className="px-2 py-1 text-xs">
            新增
          </CommandButton>}
      </div>
      <PanelCard bodyClassName="space-y-2 p-3">
        {items.map((item, index) => <PanelCard key={index} bodyClassName="grid grid-cols-1 gap-2 p-3 md:grid-cols-[150px_minmax(0,1fr)_40px]">
            <FormField label="年限">
              <div className="flex overflow-hidden rounded-md border border-sky-200 shadow-sm focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
                <TextField value={item.years} disabled={disabled} inputMode="numeric" placeholder="1" onChange={next => updateItem(index, {
              years: positiveIntegerText(next)
            })} unstyled />
                <span className="whitespace-nowrap border-l border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-500">年以上</span>
              </div>
            </FormField>
            <FormField label="要求内容">
              <TextField value={item.requirement} disabled={disabled} placeholder="经验要求" onChange={next => updateItem(index, {
            requirement: next
          })} />
            </FormField>
            {!disabled && <CommandButton aria-label={`删除${label} ${index + 1}`} onClick={() => void removeItem(index)} variant="danger" size="sm" className="mt-5 grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500">
                ×
              </CommandButton>}
          </PanelCard>)}
        {items.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
      </PanelCard>
    </div>;
}
