"use client";

import type { ReactNode, Ref } from "react";
import { useScrollToIndexedItem } from "@workspace/core/hooks";
import type {
  BodySurfaceSectionSpec,
  ConfirmOptions,
  FormSurfaceItemSpec,
  FormSurfaceLooseItem,
} from "@workspace/core/ui";
import {
  createFieldsSection,
  createPanelSection,
} from "@workspace/core/ui";

export type ResponsibilityRecord = Record<string, unknown>;

export type ResponsibilityFieldLabels = {
  itemTitlePrefix?: string;
  titleLabel?: string;
  titlePlaceholder?: string;
  entriesLabel?: string;
  entryPlaceholder?: string;
  emptyLabel?: string;
  addLabel?: string;
};

export type CreateResponsibilityFieldOptions = {
  key: string;
  title: string;
  records: ResponsibilityRecord[];
  disabled?: boolean;
  labels?: ResponsibilityFieldLabels;
  onChange: (records: ResponsibilityRecord[]) => void;
  confirmDelete?: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  getItemRef?: (index: number) => Ref<HTMLDivElement>;
  requestScrollToIndex?: (index: number) => void;
};

type ResponsibilityFrameChrome = "card" | "divider" | "plain";

export type ResponsibilityFrameSectionOptions = CreateResponsibilityFieldOptions & {
  sectionKey?: string;
  sectionTitle?: ReactNode;
  chrome?: ResponsibilityFrameChrome;
  framed?: boolean;
};

export function uniqueResponsibilityEntries(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

export function responsibilityEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueResponsibilityEntries(value.map((item) => String(item)));
}

export function responsibilityFieldSpec({
  key,
  title,
  records,
  disabled,
  labels,
  onChange,
  confirmDelete,
  getItemRef,
  requestScrollToIndex,
}: CreateResponsibilityFieldOptions): FormSurfaceItemSpec<FormSurfaceLooseItem> {
  const itemTitlePrefix = labels?.itemTitlePrefix ?? "职责";
  const titleLabel = labels?.titleLabel ?? "职责标题";
  const titlePlaceholder = labels?.titlePlaceholder ?? titleLabel;
  const entriesLabel = labels?.entriesLabel ?? "职责条目";
  const entryPlaceholder = labels?.entryPlaceholder ?? "新增职责条目";
  const emptyLabel = labels?.emptyLabel ?? "未设置";
  const addLabel = labels?.addLabel ?? `新增${title}`;

  function updateRecord(index: number, patch: ResponsibilityRecord) {
    onChange(records.map((record, recordIndex) => (
      recordIndex === index ? { ...record, ...patch } : record
    )));
  }

  function addRecord() {
    requestScrollToIndex?.(records.length);
    onChange([...records, { title: "", items: [] }]);
  }

  async function removeRecord(index: number) {
    const confirmed = confirmDelete
      ? await confirmDelete({ message: `确定删除「${title} ${index + 1}」吗？删除后需要保存才会生效。` })
      : true;
    if (confirmed) onChange(records.filter((_, recordIndex) => recordIndex !== index));
  }

  return {
    kind: "repeatable",
    key,
    title,
    addAction: disabled ? undefined : { key: `add-${key}`, label: addLabel, icon: "add", onClick: addRecord },
    empty: emptyLabel,
    layout: { columns: 1 },
    items: records.map((record, index) => {
      const items = responsibilityEntries(record.items);
      return {
        key: `${key}-${index}`,
        itemRef: getItemRef?.(index),
        title: `${itemTitlePrefix} ${index + 1}`,
        actions: disabled ? undefined : [{
          key: `delete-${key}`,
          label: "删除",
          icon: "delete-bin",
          variant: "danger" as const,
          size: "sm" as const,
          onClick: () => void removeRecord(index),
        }],
        items: [
          {
            key: "title",
            label: titleLabel,
            spec: { valueType: "string", control: "text", state: disabled ? "disabled" as const : "normal" as const },
            value: String(record.title || ""),
            placeholder: titlePlaceholder,
            onChange: (next) => updateRecord(index, { title: String(next ?? "") }),
          },
          {
            kind: "tagList" as const,
            key: "items",
            label: entriesLabel,
            items,
            getKey: (item: string, itemIndex: number) => `${item}-${itemIndex}`,
            getLabel: (item: string) => item,
            longTextMode: "wrap",
            onRemove: (_item: string, itemIndex: number) => updateRecord(index, {
              items: items.filter((__, currentIndex) => currentIndex !== itemIndex),
            }),
            onUpdateLabel: (_item: string, itemIndex: number, next: string) => updateRecord(index, {
              items: uniqueResponsibilityEntries(items.map((item, currentIndex) => currentIndex === itemIndex ? next : item)),
            }),
            disabled,
            removeConfirmMessage: (item: string) => `确定删除「${item || entriesLabel}」吗？删除后需要保存才会生效。`,
            shellClassName: "content-start",
            append: disabled ? undefined : {
              textInput: {
                key: `${key}-${index}-append`,
                placeholder: entryPlaceholder,
                onAppend: (values) => updateRecord(index, {
                  items: uniqueResponsibilityEntries([...items, ...values]),
                }),
                onRemoveLast: () => updateRecord(index, { items: items.slice(0, -1) }),
              },
            },
          },
        ],
      };
    }),
  };
}

export function responsibilityFrameSectionSpec({
  sectionKey,
  sectionTitle,
  chrome = "card",
  framed,
  ...fieldOptions
}: ResponsibilityFrameSectionOptions): BodySurfaceSectionSpec {
  const key = sectionKey ?? fieldOptions.key;
  return createPanelSection(key, {
    title: sectionTitle,
    chrome,
    framed,
    sections: [
      createFieldsSection(`${key}-fields`, [
        responsibilityFieldSpec(fieldOptions),
      ], {
        layout: { columns: 1 },
      }),
    ],
  });
}

export function useResponsibilityFrameSection(
  options: Omit<ResponsibilityFrameSectionOptions, "getItemRef" | "requestScrollToIndex">,
): BodySurfaceSectionSpec {
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem<HTMLDivElement>(options.records.length);
  return responsibilityFrameSectionSpec({
    ...options,
    getItemRef,
    requestScrollToIndex,
  });
}
