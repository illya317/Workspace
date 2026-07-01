"use client";

import { createPageBody, PageSurface, createFieldsSection, useFeedback } from "@workspace/core/ui";
import { HR_MAJOR_OPTIONS, normalizeHrMajorItems, type HRMajorItem } from "@workspace/hr/constants/field-options";
import { ENVIRONMENT_FACTOR_OPTIONS, WORK_AREA_OPTIONS, pickerOptions, primitiveListItems } from "./description-details";
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
  const feedback = useFeedback();
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
    const confirmed = await feedback.confirmDelete({
      message: `确定删除工作区域「${items[index]?.area || "未设置"}」吗？删除后需要保存才会生效。`
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  const addAreaFields = !disabled ? [{
    key: "addArea",
    label: "新增工作区域",
    spec: { valueType: "string" as const, control: "choice" as const, state: availableAreas.length === 0 ? "disabled" as const : "normal" as const, options: { source: "static" as const, items: pickerOptions(availableAreas), searchPlaceholder: "搜索工作区域" } },
    value: "",
    placeholder: "新增工作区域",
    onChange: (next: unknown) => addArea(next == null ? null : String(next)),

  }] : [];
  return <div className="space-y-2">
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFieldsSection<string>("work-environments", [
          {
            kind: "repeatable",
            key: "work-environments",
            title: label,
            empty: "未设置",
            layout: { columns: 2 },
            items: items.map((item, index) => {
              const areaOptions = [item.area, ...availableAreas].filter((area, areaIndex, array) => array.indexOf(area) === areaIndex);
              const availableFactors = ENVIRONMENT_FACTOR_OPTIONS.filter((factor) => !item.factors.includes(factor));
              return {
                key: `${item.area}-${index}`,
                actions: disabled ? undefined : [{ key: "delete-area", label: "删除", icon: "delete-bin", variant: "danger", size: "sm", onClick: () => void removeArea(index),  }],
                items: [
                  {
                    key: "area",
                    label: "工作区域",
                    spec: { valueType: "string", control: "choice", state: disabled ? "disabled" : "normal", options: { source: "static", items: pickerOptions(areaOptions), searchPlaceholder: "搜索工作区域" } },
                    value: item.area,
                    placeholder: "选择工作区域",
                    onChange: (next: unknown) => updateItem(index, { area: String(next ?? "") }),
                  },
                  {
                    kind: "tagList",
                    key: "factors",
                    label: "环境因素",
                    items: item.factors,
                    getKey: (factor: string, factorIndex: number) => `${factor}-${factorIndex}`,
                    getLabel: (factor: string) => factor,
                    onRemove: (_: string, factorIndex: number) => updateItem(index, { factors: item.factors.filter((__, currentIndex) => currentIndex !== factorIndex) }),
                    onUpdateLabel: (_: string, factorIndex: number, next: string) => updateItem(index, { factors: [...new Set(item.factors.map((factor, currentIndex) => currentIndex === factorIndex ? next : factor))] }),
                    disabled,
                    confirmDelete: feedback.confirmDelete,
                    removeConfirmMessage: (factor: string) => `确定删除「${factor || "环境因素"}」吗？删除后需要保存才会生效。`,
                    emptyText: disabled ? "未设置" : undefined,
                    shellClassName: "content-start",

                    append: disabled ? undefined : {
                      width: "md",
                      field: {
                        key: "appendFactor",
                        label: "",
                        spec: { valueType: "string", control: "choice", state: availableFactors.length === 0 ? "disabled" : "normal", options: { source: "static", items: pickerOptions(availableFactors), visibleCount: 6, searchPlaceholder: "搜索环境因素" } },
                        value: "",
                        placeholder: item.factors.length === 0 ? "添加环境因素" : "继续添加",
                        onChange: (next: unknown) => {
                          const factor = next == null ? "" : String(next);
                          if (!factor) return;
                          updateItem(index, { factors: [...item.factors, factor].filter((current, currentIndex, array) => array.indexOf(current) === currentIndex) });
                        },
                      },
                    },
                  },
                ],
              };
            }),
          },
          ...addAreaFields,
        ])])}
      />
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
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFieldsSection<HRMajorItem>("major-requirements", [{
          kind: "tagList",
          key: "majorRequirements",
          label: "",
          items,
          getKey: (item, index) => `${item.category}-${item.specialty}-${index}`,
          getLabel: (item) => item.specialty || item.category,
          onRemove: (_, index) => removeItem(index),
          disabled,
          confirmMessage: (item) => `确定删除专业要求「${item.category || ""}${item.specialty ? ` / ${item.specialty}` : ""}」吗？删除后需要保存才会生效。`,
          itemTitle: (item) => (item.category ? `${item.category} / ${item.specialty}` : item.specialty),
          emptyText: disabled ? "未设置" : undefined,
          shellClassName: "content-start",
          append: disabled ? undefined : {
            field: {
              key: "majorAppend",
              label: "",
              spec: {
                valueType: "string",
                control: "choice",
                state: disabled ? "disabled" : "normal",
                options: {
                  source: "static",
                  items: HR_MAJOR_OPTIONS.map((option) => ({
                    value: option.specialty,
                    label: option.specialty,
                    subtitle: option.category,
                    searchText: option.category,
                  })),
                  visibleCount: 5,
                },
              },
              value: "",
              placeholder: "未设置",
              onChange: (next) => addItem(next == null ? null : String(next)),
            },
          },
        }])])}
      />
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
  const feedback = useFeedback();
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
    const confirmed = await feedback.confirmDelete({
      message: `确定删除「${items[index]?.requirement || label}」吗？删除后需要保存才会生效。`
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  return <div className="space-y-2">
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFieldsSection("experience-requirements", [{
          kind: "repeatable",
          key: "experience-requirements",
          title: label,
          addAction: disabled ? undefined : { key: "add-experience", label: "新增", icon: "add", size: "sm", onClick: addItem,  },
          empty: "未设置",
          layout: { columns: 2 },
          items: items.map((item, index) => ({
            key: `experience-${index}`,
            actions: disabled ? undefined : [{ key: "delete-experience", label: "删除", icon: "delete-bin", variant: "danger", size: "sm", onClick: () => void removeItem(index),  }],
            items: [
              {
                key: "years",
                label: "年限（年以上）",
                spec: { valueType: "number", control: "text", state: disabled ? "disabled" : "normal" },
                value: item.years,
                inputMode: "numeric",
                placeholder: "1",
                onChange: (next: unknown) => updateItem(index, { years: positiveIntegerText(String(next ?? "")) }),
              },
              {
                key: "requirement",
                label: "要求内容",
                spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
                value: item.requirement,
                placeholder: "经验要求",
                onChange: (next: unknown) => updateItem(index, { requirement: String(next ?? "") }),
              },
            ],
          })),
        }])])}
      />
    </div>;
}
