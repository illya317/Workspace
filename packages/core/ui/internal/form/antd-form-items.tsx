"use client";

import { Card, Divider, Empty, Flex, Form, Typography } from "antd";
import type { ReactNode, Ref } from "react";
import { useScrollToIndexedItem } from "../../../hooks/useScrollToIndexedItem";
import FieldGrid from "../input/FieldGrid";
import {
  isInputField,
  isMultilineInputField,
  renderFieldValue,
  resolveFormSurfaceFieldSpan,
} from "./FormSurface.controls";
import { isFormSurfaceFieldRequired } from "./form-surface-required";
import { AntdFormCommands } from "./antd-form-actions";
import type {
  FormSurfaceCommandSpec,
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceLayoutSpec,
  FormSurfaceRepeatableItemSpec,
  FormSurfaceSectionSpec,
} from "../../FormSurface.types";

export interface AntdResolvedFormLayout {
  flow: "grid" | "inline" | "single";
  columns: 1 | 2 | 3 | 4 | 6;
  mode: NonNullable<FormSurfaceLayoutSpec["mode"]>;
  density: NonNullable<FormSurfaceLayoutSpec["density"]>;
  fieldLayout: NonNullable<FormSurfaceLayoutSpec["fieldLayout"]>;
  commandPlacement: "below" | "inline";
}

export function resolveAntdFormLayout(
  kind: FormSurfaceKind,
  layout?: FormSurfaceLayoutSpec & { commandPlacement?: "below" | "inline" },
): AntdResolvedFormLayout {
  const defaults: AntdResolvedFormLayout = kind === "filters"
    ? { flow: "inline", columns: 3, mode: "mixed", density: "compact", fieldLayout: "inline", commandPlacement: "below" }
    : kind === "detail"
      ? { flow: "grid", columns: 3, mode: "detail", density: "compact", fieldLayout: "inline", commandPlacement: "below" }
      : kind === "login"
        ? { flow: "single", columns: 1, mode: "mixed", density: "normal", fieldLayout: "inline", commandPlacement: "below" }
        : { flow: "grid", columns: 3, mode: "mixed", density: "normal", fieldLayout: "inline", commandPlacement: "below" };
  return { ...defaults, ...layout };
}

function sectionChrome<T>(section: FormSurfaceSectionSpec<T>) {
  if (section.chrome) return section.chrome;
  return section.framed === false ? "plain" as const : "card" as const;
}

function fieldHelp<T>(item: Exclude<FormSurfaceItemSpec<T>, { kind: "note" | "groupTitle" | "section" | "repeatable" }>) {
  return item.error ?? item.hint;
}

function fieldHelpNode<T>(item: Exclude<FormSurfaceItemSpec<T>, { kind: "note" | "groupTitle" | "section" | "repeatable" }>) {
  const help = fieldHelp(item);
  if (!help) return undefined;
  return (
    <span
      className={item.error ? "text-red-600" : undefined}
      data-form-field-help={item.error ? "error" : "hint"}
    >
      {help}
    </span>
  );
}

function FieldValue<T>({
  item,
  layout,
}: {
  item: Exclude<FormSurfaceItemSpec<T>, { kind: "note" | "groupTitle" | "section" | "repeatable" }>;
  layout: AntdResolvedFormLayout;
}) {
  const fieldActions = isInputField(item) ? item.actions : undefined;
  const value = renderFieldValue(item, layout.density);
  if (!fieldActions?.length) return value;
  return (
    <Flex gap="small" align="center" className="min-w-0">
      <div className="min-w-0 flex-1">{value}</div>
      <AntdFormCommands commands={fieldActions} />
    </Flex>
  );
}

function GridField<T>({
  item,
  layout,
}: {
  item: Exclude<FormSurfaceItemSpec<T>, { kind: "note" | "groupTitle" | "section" | "repeatable" }>;
  layout: AntdResolvedFormLayout;
}) {
  return (
    <FieldGrid.Cell
      key={item.key}
      label={item.label}
      required={isFormSurfaceFieldRequired(item)}
      span={resolveFormSurfaceFieldSpan(item)}
      rowSpan={item.rowSpan}
      mode={layout.mode}
      fieldLayout={layout.fieldLayout}
      hint={fieldHelpNode(item)}
    >
      <Form.Item
        className="!mb-0 min-w-0"
        validateStatus={item.error ? "error" : undefined}
      >
        <FieldValue item={item} layout={layout} />
      </Form.Item>
    </FieldGrid.Cell>
  );
}

function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: FormSurfaceCommandSpec[];
}) {
  if (!title && !subtitle && !actions?.length) return null;
  return (
    <Flex justify="space-between" align="flex-start" gap="middle" data-antd-form-section-header="true">
      <div className="min-w-0">
        {title ? <Typography.Title level={5} className="!mb-0">{title}</Typography.Title> : null}
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      <AntdFormCommands commands={actions} />
    </Flex>
  );
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else ref.current = node;
}

function useRevealOnAdd<T>(items: FormSurfaceRepeatableItemSpec<T>[], addAction?: FormSurfaceCommandSpec) {
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem<HTMLDivElement>(items.length);
  const wrappedAddAction = addAction ? {
    ...addAction,
    onClick: () => {
      requestScrollToIndex(items.length);
      addAction.onClick?.();
    },
  } : undefined;
  const itemRef = (item: FormSurfaceRepeatableItemSpec<T>, index: number): Ref<HTMLDivElement> => {
    const internalRef = getItemRef(index);
    return (node) => {
      internalRef(node);
      assignRef(item.itemRef, node);
    };
  };
  return { itemRef, wrappedAddAction };
}

function RepeatableFields<T>({
  item,
  layout,
}: {
  item: FormSurfaceRepeatableItemSpec<T>;
  layout: AntdResolvedFormLayout;
}) {
  const inlineActions = !item.title && !item.subtitle ? item.actions : undefined;
  const fields = (
    <FieldGrid columns={layout.columns} mode={layout.mode} fieldLayout={layout.fieldLayout}>
      {item.items.map((nested) => <AntdGridItem item={nested} layout={layout} key={nested.key} />)}
    </FieldGrid>
  );
  if (!inlineActions?.length) return fields;
  return (
    <Flex gap="small" align="center" data-form-repeatable-inline-actions="true">
      <div className="min-w-0 flex-1">{fields}</div>
      <AntdFormCommands commands={inlineActions} />
    </Flex>
  );
}

function AntdRepeatable<T>({
  item,
  layout,
}: {
  item: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>;
  layout: AntdResolvedFormLayout;
}) {
  const resolved = resolveAntdFormLayout("fields", { ...layout, ...item.layout });
  const { itemRef, wrappedAddAction } = useRevealOnAdd(item.items, item.addAction);
  return (
    <div className="col-span-full space-y-3" data-antd-form-item-kind="repeatable">
      <SectionHeader title={item.title} subtitle={item.subtitle} actions={wrappedAddAction ? [wrappedAddAction] : undefined} />
      {item.items.length === 0 ? (
        <Empty description={item.empty ?? "暂无数据"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="divide-y divide-slate-100" data-form-repeatable-list="true">
          {item.items.map((repeatableItem, index) => (
            <div
              className="py-4 first:pt-0 last:pb-0"
              data-form-repeatable-item="true"
              key={repeatableItem.key}
              ref={itemRef(repeatableItem, index)}
            >
              {repeatableItem.title || repeatableItem.subtitle ? (
                <div className="mb-3">
                  <SectionHeader title={repeatableItem.title} subtitle={repeatableItem.subtitle} actions={repeatableItem.actions} />
                </div>
              ) : null}
              <RepeatableFields item={repeatableItem} layout={resolved} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AntdSection<T>({
  item,
  layout,
  insideFrame,
}: {
  item: Extract<FormSurfaceItemSpec<T>, { kind: "section" }>;
  layout: AntdResolvedFormLayout;
  insideFrame: boolean;
}) {
  const resolved = resolveAntdFormLayout("fields", { ...layout, ...item.layout });
  const chrome = sectionChrome(item);
  const primaryCard = chrome === "card" && !insideFrame;
  const header = <SectionHeader title={item.title} subtitle={item.subtitle} actions={item.actions} />;
  const content = (
    <FieldGrid columns={resolved.columns} mode={resolved.mode} fieldLayout={resolved.fieldLayout}>
      {item.items.map((nested) => (
        <AntdGridItem item={nested} layout={resolved} key={nested.key} insideFrame={insideFrame || chrome === "card"} />
      ))}
    </FieldGrid>
  );
  if (primaryCard) {
    return (
      <Card
        className="col-span-full border-slate-200 shadow-sm"
        data-antd-form-item-kind="section"
        data-form-section-frame="primary"
        extra={item.actions?.length ? <AntdFormCommands commands={item.actions} /> : undefined}
        title={item.title ?? undefined}
        variant="outlined"
      >
        {item.subtitle ? <Typography.Paragraph type="secondary">{item.subtitle}</Typography.Paragraph> : null}
        {content}
      </Card>
    );
  }
  return (
    <section
      className="col-span-full space-y-4"
      data-antd-form-item-kind="section"
      data-form-section-frame={chrome === "card" ? "nested" : undefined}
    >
      {header}
      {chrome === "divider" && header ? <Divider className="!my-0" /> : null}
      {content}
    </section>
  );
}

export function AntdGridItem<T>({
  item,
  layout,
  insideFrame = false,
}: {
  item: FormSurfaceItemSpec<T>;
  layout: AntdResolvedFormLayout;
  insideFrame?: boolean;
}) {
  if (item.kind === "note") {
    return <FieldGrid.Note><Typography.Text type="secondary" data-antd-form-item-kind="note">{item.content}</Typography.Text></FieldGrid.Note>;
  }
  if (item.kind === "groupTitle") {
    return <FieldGrid.GroupTitle className="col-span-full"><Typography.Text strong data-antd-form-item-kind="groupTitle">{item.title}</Typography.Text></FieldGrid.GroupTitle>;
  }
  if (item.kind === "section") return <AntdSection item={item} layout={layout} insideFrame={insideFrame} />;
  if (item.kind === "repeatable") return <AntdRepeatable item={item} layout={layout} />;
  return <div className="contents" data-antd-form-item-kind={item.kind ?? "field"}><GridField item={item} layout={layout} /></div>;
}

function AntdInlineItem<T>({ item, layout }: { item: FormSurfaceItemSpec<T>; layout: AntdResolvedFormLayout }) {
  if (item.kind === "note") return <Typography.Text type="secondary" data-antd-form-item-kind="note">{item.content}</Typography.Text>;
  if (item.kind === "groupTitle") return <Typography.Text strong data-antd-form-item-kind="groupTitle">{item.title}</Typography.Text>;
  if (item.kind === "section" || item.kind === "repeatable") {
    return (
      <div className="w-full basis-full">
        <AntdGridItem item={item} layout={layout} insideFrame={item.kind === "section"} />
      </div>
    );
  }
  const multiline = isMultilineInputField(item);
  return (
    <Form.Item
      className={multiline ? "!mb-0 w-full basis-full" : "!mb-0 min-w-52 max-sm:w-full max-sm:min-w-0"}
      data-antd-form-item-kind={item.kind ?? "field"}
      extra={fieldHelpNode(item)}
      label={item.label}
      layout={multiline ? "vertical" : "horizontal"}
      required={isFormSurfaceFieldRequired(item)}
      validateStatus={item.error ? "error" : undefined}
    >
      <FieldValue item={item} layout={layout} />
    </Form.Item>
  );
}

function AntdLoginItem<T>({ item, layout }: { item: FormSurfaceItemSpec<T>; layout: AntdResolvedFormLayout }) {
  if (item.kind === "section" || item.kind === "repeatable" || item.kind === "note" || item.kind === "groupTitle") {
    return <AntdGridItem item={item} layout={layout} />;
  }
  return (
    <div className="col-span-full min-w-0" data-antd-form-item-kind={item.kind ?? "field"}>
      <Form.Item
        className="!mb-0"
        extra={fieldHelpNode(item)}
        label={item.label}
        layout="vertical"
        required={isFormSurfaceFieldRequired(item)}
        validateStatus={item.error ? "error" : undefined}
      >
        <FieldValue item={item} layout={layout} />
      </Form.Item>
    </div>
  );
}

export function AntdFormItems<T>({
  items,
  kind,
  layout,
  inlineCommands,
  insideFrame,
}: {
  items: FormSurfaceItemSpec<T>[];
  kind: FormSurfaceKind;
  layout: AntdResolvedFormLayout;
  inlineCommands?: ReactNode;
  insideFrame: boolean;
}) {
  if (!items.length && !inlineCommands) return null;
  if (layout.flow === "inline") {
    return (
      <Flex wrap gap="middle" align="center" data-antd-form-flow="inline">
        {items.map((item) => <AntdInlineItem item={item} layout={layout} key={item.key} />)}
        {inlineCommands}
      </Flex>
    );
  }
  if (kind === "login") {
    return (
      <FieldGrid columns={1} mode="mixed" fieldLayout={layout.fieldLayout} className="w-full gap-4">
        {items.map((item) => <AntdLoginItem item={item} layout={layout} key={item.key} />)}
      </FieldGrid>
    );
  }
  return (
    <FieldGrid columns={layout.flow === "single" ? 1 : layout.columns} mode={layout.mode} fieldLayout={layout.fieldLayout}>
      {items.map((item) => <AntdGridItem item={item} layout={layout} key={item.key} insideFrame={insideFrame} />)}
    </FieldGrid>
  );
}
