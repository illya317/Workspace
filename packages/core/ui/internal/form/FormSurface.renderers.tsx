"use client";

import type { ReactNode } from "react";
import FieldGrid from "../input/FieldGrid";
import FormField from "./FormField";
import { renderCommands, renderFieldValue } from "./FormSurface.controls";
import type {
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceLayoutSpec,
  FormSurfaceProps,
  FormSurfaceSectionChrome,
  FormSurfaceSectionSpec,
} from "../../FormSurface.types";

type ResolvedFormLayout = Required<FormSurfaceLayoutSpec>;

function defaultLayout(kind: FormSurfaceKind): ResolvedFormLayout {
  if (kind === "filters") return { flow: "inline", columns: 3, mode: "mixed", density: "compact" };
  if (kind === "detail") return { flow: "grid", columns: 3, mode: "detail", density: "compact" };
  if (kind === "login") return { flow: "single", columns: 1, mode: "mixed", density: "normal" };
  return { flow: "grid", columns: 3, mode: "mixed", density: "normal" };
}

function resolveLayout(kind: FormSurfaceKind, layout?: FormSurfaceLayoutSpec): ResolvedFormLayout {
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
  return (
    <FieldGrid.Cell
      key={field.key}
      label={field.label}
      required={field.required}
      hint={field.hint ?? field.error}
      span={field.span}
      mode={layout.mode}
    >
      {renderFieldValue(field, layout.density)}
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
  const repeatableLayout = resolveLayout("fields", { ...layout, ...field.layout });
  return (
    <div key={field.key} className="col-span-full space-y-3">
      {(field.title || field.subtitle || field.addAction) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {field.title ? <h3 className="text-base font-semibold text-slate-900">{field.title}</h3> : null}
            {field.subtitle ? <p className="mt-1 text-sm text-slate-500">{field.subtitle}</p> : null}
          </div>
          {field.addAction ? renderCommands([field.addAction]) : null}
        </div>
      )}
      {field.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">{field.empty ?? "暂无数据"}</div>
      ) : (
        <div className="space-y-3">
          {field.items.map((item) => (
            <div key={item.key} ref={item.itemRef} className="rounded-md border border-slate-200 p-3">
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
  if (field.kind === "section" || field.kind === "repeatable") {
    const nestedLayout = resolveLayout("filters", { ...layout, ...field.layout });
    const headerActions = field.kind === "section"
      ? renderCommands(field.actions)
      : field.addAction ? renderCommands([field.addAction]) : null;
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
        {field.kind === "section" ? (
          <FieldGrid columns={nestedLayout.columns} mode={nestedLayout.mode}>
            {field.items.map((item) => renderGridItem(item, nestedLayout))}
          </FieldGrid>
        ) : renderInlineRepeatable(field, nestedLayout)}
      </div>
    );
  }
  return (
    <FormField key={field.key} label={field.label} required={field.required} hint={field.hint} error={field.error} layout="inline">
      {renderFieldValue(field, layout.density)}
    </FormField>
  );
}

function renderInlineRepeatable<T>(
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>,
  layout: ResolvedFormLayout,
) {
  if (field.items.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-400">{field.empty ?? "暂无数据"}</div>;
  }
  return (
    <div className="space-y-2">
      {field.items.map((item) => (
        <div key={item.key} ref={item.itemRef} className="rounded-md border border-slate-200 p-3">
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

function renderItems<T>(props: FormSurfaceProps<T>) {
  const items = props.content.items;
  if (!items.length) return null;
  const layout = resolveLayout(props.kind, props.content.layout);
  if (layout.flow === "inline") {
    return <div className="flex flex-wrap items-center gap-3">{items.map((item) => renderInlineItem(item, layout))}</div>;
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
  return (
    <div className="space-y-4">
      {renderItems(props)}
      {renderCommands(props.commands)}
    </div>
  );
}
