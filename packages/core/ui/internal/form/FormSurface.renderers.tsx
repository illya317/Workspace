"use client";

import type { ReactNode, Ref } from "react";
import { useScrollToIndexedItem } from "../../../hooks/useScrollToIndexedItem";
import FieldGrid from "../input/FieldGrid";
import FormField from "./FormField";
import { isInputField, renderCommands, renderFieldValue } from "./FormSurface.controls";
import { ACTION_GLYPH_ACTION_BY_KEY } from "../action/ActionGlyphs";
import { orderFormSurfaceActions, renderFormSurfaceActions } from "./form-surface-actions";
import type {
  FormSurfaceCommandSpec,
  FormSurfaceFilterLayoutSpec,
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceLayoutSpec,
  FormSurfaceProps,
  FormSurfaceRepeatableItemSpec,
  FormSurfaceSectionChrome,
  FormSurfaceSectionSpec,
} from "../../FormSurface.types";

type ResolvedFormLayout = Required<FormSurfaceLayoutSpec> & { commandPlacement: "below" | "inline" };

function defaultLayout(kind: FormSurfaceKind): ResolvedFormLayout {
  if (kind === "filters") return { flow: "inline", columns: 3, mode: "mixed", density: "compact", commandPlacement: "below" };
  if (kind === "detail") return { flow: "grid", columns: 3, mode: "detail", density: "compact", commandPlacement: "below" };
  if (kind === "login") return { flow: "single", columns: 1, mode: "mixed", density: "normal", commandPlacement: "below" };
  return { flow: "grid", columns: 3, mode: "mixed", density: "normal", commandPlacement: "below" };
}

function resolveLayout(kind: FormSurfaceKind, layout?: FormSurfaceLayoutSpec | FormSurfaceFilterLayoutSpec): ResolvedFormLayout {
  return { ...defaultLayout(kind), ...layout };
}

function formSectionChrome<T>(field: FormSurfaceSectionSpec<T>): FormSurfaceSectionChrome {
  if (field.chrome) return field.chrome;
  return field.framed === false ? "plain" : "card";
}

function renderGridItem<T>(
  field: FormSurfaceItemSpec<T>,
  layout: ResolvedFormLayout,
): ReactNode {
  if (field.kind === "note") {
    return <FieldGrid.Note key={field.key}>{field.content}</FieldGrid.Note>;
  }
  if (field.kind === "groupTitle") {
    return <FieldGrid.GroupTitle key={field.key} className="col-span-full">{field.title}</FieldGrid.GroupTitle>;
  }
  if (field.kind === "section") {
    const sectionLayout = resolveLayout("fields", { ...layout, ...field.layout });
    const chrome = formSectionChrome(field);
    const header = (field.title || field.subtitle || field.actions?.length) ? (
      <div className={`flex items-start justify-between gap-3 ${chrome === "divider" ? "border-b border-slate-200 pb-3" : ""}`}>
        <div className="min-w-0">
          {field.title ? <h3 className="text-base font-semibold text-slate-900">{field.title}</h3> : null}
          {field.subtitle ? <p className="mt-1 text-sm text-slate-500">{field.subtitle}</p> : null}
        </div>
        {renderCommands(field.actions)}
      </div>
    ) : null;
    return (
      <section
        key={field.key}
        className={chrome === "card"
          ? "col-span-full space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          : "col-span-full space-y-4"}
      >
        {header}
        <FieldGrid columns={sectionLayout.columns} mode={sectionLayout.mode}>
          {field.items.map((item) => renderGridItem(item, sectionLayout))}
        </FieldGrid>
      </section>
    );
  }
  if (field.kind === "repeatable") return renderRepeatableGridItem(field, layout);
  const fieldActions = isInputField(field) ? field.actions : undefined;
  return (
    <FieldGrid.Cell
      key={field.key}
      label={field.label}
      required={field.required}
      hint={field.hint ?? field.error}
      span={field.span}
      rowSpan={field.rowSpan}
      mode={layout.mode}
    >
      {fieldActions?.length ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">{renderFieldValue(field, layout.density)}</div>
          {renderCommands(fieldActions)}
        </div>
      ) : renderFieldValue(field, layout.density)}
    </FieldGrid.Cell>
  );
}

function renderLoginItem<T>(field: FormSurfaceItemSpec<T>): ReactNode {
  if (field.kind === "note") {
    return <FieldGrid.Note key={field.key} className="px-0 py-0">{field.content}</FieldGrid.Note>;
  }
  if (field.kind === "groupTitle") {
    return <FieldGrid.GroupTitle key={field.key} className="col-span-full">{field.title}</FieldGrid.GroupTitle>;
  }
  if (field.kind === "section" || field.kind === "repeatable") return renderGridItem(field, defaultLayout("login"));
  return (
    <div key={field.key} className="col-span-full min-w-0">
      <div className="min-w-0 [&>*]:w-full [&_input]:w-full [&_textarea]:w-full">
        {renderFieldValue(field, "normal")}
      </div>
      {(field.hint || field.error) && (
        <div className="text-xs text-slate-400">{field.hint ?? field.error}</div>
      )}
    </div>
  );
}

function renderRepeatableGridItem<T>(
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>,
  layout: ResolvedFormLayout,
) {
  return <RepeatableGridItem key={field.key} field={field} layout={layout} />;
}

function useRevealOnAdd<T>(items: FormSurfaceRepeatableItemSpec<T>[], addAction?: FormSurfaceCommandSpec) {
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem<HTMLDivElement>(items.length);
  const wrappedAddAction = addAction
    ? {
        ...addAction,
        onClick: () => {
          requestScrollToIndex(items.length);
          addAction.onClick?.();
        },
      }
    : undefined;

  function itemRef(item: FormSurfaceRepeatableItemSpec<T>, index: number): Ref<HTMLDivElement> {
    const internalRef = getItemRef(index);
    return (node) => {
      internalRef(node);
      assignRef(item.itemRef, node);
    };
  }

  return { itemRef, wrappedAddAction };
}

function RepeatableGridItem<T>({
  field,
  layout,
}: {
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>;
  layout: ResolvedFormLayout;
}) {
  const repeatableLayout = resolveLayout("fields", { ...layout, ...field.layout });
  const { itemRef, wrappedAddAction } = useRevealOnAdd(field.items, field.addAction);
  return (
    <div key={field.key} className="col-span-full space-y-3">
      {(field.title || field.subtitle || wrappedAddAction) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {field.title ? <h3 className="text-base font-semibold text-slate-900">{field.title}</h3> : null}
            {field.subtitle ? <p className="mt-1 text-sm text-slate-500">{field.subtitle}</p> : null}
          </div>
          {wrappedAddAction ? renderCommands([wrappedAddAction]) : null}
        </div>
      )}
      {field.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">{field.empty ?? "暂无数据"}</div>
      ) : (
        <div className="space-y-3">
          {field.items.map((item, index) => (
            <div key={item.key} ref={itemRef(item, index)} className="rounded-md border border-slate-200 p-3">
              {(item.title || item.subtitle || item.actions?.length) && (
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {item.title ? <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4> : null}
                    {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
                  </div>
                  {renderCommands(item.actions)}
                </div>
              )}
              <FieldGrid columns={repeatableLayout.columns} mode={repeatableLayout.mode}>
                {item.items.map((nested) => renderGridItem(nested, repeatableLayout))}
              </FieldGrid>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderInlineItem<T>(field: FormSurfaceItemSpec<T>, layout: ResolvedFormLayout) {
  if (field.kind === "note") return <div key={field.key} className="text-sm text-slate-500">{field.content}</div>;
  if (field.kind === "groupTitle") return <div key={field.key} className="text-sm font-semibold text-slate-900">{field.title}</div>;
  if (field.kind === "section") {
    const nestedLayout = resolveLayout("filters", { ...layout, ...field.layout });
    const headerActions = renderCommands(field.actions);
    return (
      <div key={field.key} className="w-full basis-full space-y-2">
        {(field.title || field.subtitle || headerActions) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {field.title ? <h3 className="text-sm font-semibold text-slate-900">{field.title}</h3> : null}
              {field.subtitle ? <p className="mt-1 text-xs text-slate-500">{field.subtitle}</p> : null}
            </div>
            {headerActions}
          </div>
        )}
        <FieldGrid columns={nestedLayout.columns} mode={nestedLayout.mode}>
          {field.items.map((item) => renderGridItem(item, nestedLayout))}
        </FieldGrid>
      </div>
    );
  }
  if (field.kind === "repeatable") {
    return <InlineRepeatableBlock key={field.key} field={field} layout={resolveLayout("filters", { ...layout, ...field.layout })} />;
  }
  const fieldActions = isInputField(field) ? field.actions : undefined;
  return (
    <FormField key={field.key} label={field.label} required={field.required} hint={field.hint} error={field.error} layout="inline">
      {fieldActions?.length ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">{renderFieldValue(field, layout.density)}</div>
          {renderCommands(fieldActions)}
        </div>
      ) : renderFieldValue(field, layout.density)}
    </FormField>
  );
}

function InlineRepeatableBlock<T>({
  field,
  layout,
}: {
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>;
  layout: ResolvedFormLayout;
}) {
  const { itemRef, wrappedAddAction } = useRevealOnAdd(field.items, field.addAction);
  const headerActions = wrappedAddAction ? renderCommands([wrappedAddAction]) : null;
  return (
    <div key={field.key} className="w-full basis-full space-y-2">
      {(field.title || field.subtitle || headerActions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {field.title ? <h3 className="text-sm font-semibold text-slate-900">{field.title}</h3> : null}
            {field.subtitle ? <p className="mt-1 text-xs text-slate-500">{field.subtitle}</p> : null}
          </div>
          {headerActions}
        </div>
      )}
      {renderInlineRepeatableItems(field, layout, itemRef)}
    </div>
  );
}

function renderInlineRepeatableItems<T>(
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>,
  layout: ResolvedFormLayout,
  itemRef: (item: FormSurfaceRepeatableItemSpec<T>, index: number) => Ref<HTMLDivElement>,
) {
  if (field.items.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-400">{field.empty ?? "暂无数据"}</div>;
  }
  return (
    <div className="space-y-2">
      {field.items.map((item, index) => (
        <div key={item.key} ref={itemRef(item, index)} className="rounded-md border border-slate-200 p-3">
          {(item.title || item.subtitle || item.actions?.length) && (
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                {item.title ? <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4> : null}
                {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
              </div>
              {renderCommands(item.actions)}
            </div>
          )}
          <FieldGrid columns={layout.columns} mode={layout.mode}>{item.items.map((nested) => renderGridItem(nested, layout))}</FieldGrid>
        </div>
      ))}
    </div>
  );
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  ref.current = node;
}

function renderItems<T>(props: FormSurfaceProps<T>, layout: ResolvedFormLayout, inlineCommands?: ReactNode) {
  const items = props.content.items;
  if (!items.length && !inlineCommands) return null;
  if (layout.flow === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {items.map((item) => renderInlineItem(item, layout))}
        {inlineCommands}
      </div>
    );
  }
  if (props.kind === "login") {
    return (
      <FieldGrid columns={1} mode="mixed" className="w-full gap-4">
        {items.map(renderLoginItem)}
      </FieldGrid>
    );
  }
  return (
    <FieldGrid columns={layout.columns} mode={layout.mode}>
      {items.map((field) => renderGridItem(field, layout))}
    </FieldGrid>
  );
}

export function renderContent<T>(props: FormSurfaceProps<T>) {
  const layout = resolveLayout(props.kind, props.content.layout);
  const commands = props.kind === "filters" ? renderCommands(props.commands) : null;
  const inlineCommands = layout.flow === "inline" && layout.commandPlacement === "inline" ? commands : undefined;
  const actions = props.kind === "login"
    ? renderLoginActions(props.actions)
    : renderFormSurfaceActions(props.actions, layout.density);
  const headerActions = props.kind === "login" ? null : actions;
  const header = props.header?.title || props.header?.description || headerActions ? (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {props.header?.title ? <h3 className="text-base font-semibold text-slate-900">{props.header.title}</h3> : null}
        {props.header?.description ? <p className="text-sm text-slate-500">{props.header.description}</p> : null}
      </div>
      {headerActions}
    </div>
  ) : null;
  return (
    <div className="space-y-4">
      {header}
      {renderItems(props, layout, inlineCommands)}
      {props.kind === "login" ? actions : null}
      {inlineCommands ? null : commands}
    </div>
  );
}

function renderLoginActions(actions: FormSurfaceProps["actions"]) {
  if (!actions?.length) return null;
  return (
    <div className="col-span-full space-y-3">
      {orderFormSurfaceActions(actions).map((action) => {
        const definition = ACTION_GLYPH_ACTION_BY_KEY[action.action];
        const submitsForm = action.action === "submit" && !action.onClick;
        const tone = definition.variant === "primary"
          ? "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-300";
        return (
          <button
            key={action.key}
            type={submitsForm ? "submit" : "button"}
            disabled={action.disabled}
            onClick={action.onClick}
            className={`h-12 w-full rounded-md px-5 text-base font-semibold shadow-sm transition disabled:cursor-not-allowed ${tone}`}
          >
            {action.label ?? definition.label}
          </button>
        );
      })}
    </div>
  );
}
