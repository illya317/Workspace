"use client";

import type { ReactNode } from "react";
import FieldGrid, { type FieldGridMode } from "./FieldGrid";
import FormField from "./FormField";
import type { InputControlProps } from "./InputControl";
import { joinClassNames } from "./card-utils";
import { renderCommands, renderFieldValue } from "./FormSurface.controls";
import type {
  FormSurfaceFieldSpec,
  FormSurfaceFieldModeProps,
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceTagListFieldSpec,
} from "./FormSurface.types";

function getFields<T>(props: FormSurfaceFieldModeProps<T>): FormSurfaceItemSpec<T>[] {
  return props.field ? [props.field, ...(props.fields ?? [])] : props.fields ?? [];
}

function renderGridItem<T>(
  field: FormSurfaceItemSpec<T>,
  mode: FieldGridMode,
  density: InputControlProps["density"],
  columns: 1 | 2 | 3,
): ReactNode {
  if (field.kind === "note") {
    return <FieldGrid.Note key={field.key} className={field.className}>{field.content}</FieldGrid.Note>;
  }
  if (field.kind === "groupTitle") {
    return <FieldGrid.GroupTitle key={field.key} className={joinClassNames("col-span-full", field.className)}>{field.title}</FieldGrid.GroupTitle>;
  }
  if (field.kind === "section") {
    return (
      <div key={field.key} className={joinClassNames("col-span-full space-y-3", field.className)}>
        {(field.title || field.subtitle || field.actions?.length) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {field.title ? <h3 className="text-base font-semibold text-slate-900">{field.title}</h3> : null}
              {field.subtitle ? <p className="mt-1 text-sm text-slate-500">{field.subtitle}</p> : null}
            </div>
            {renderCommands(field.actions)}
          </div>
        )}
        <FieldGrid columns={field.columns ?? columns} mode={field.mode ?? mode} className={field.bodyClassName}>
          {field.fields.map((item) => renderGridItem(item, field.mode ?? mode, density, field.columns ?? columns))}
        </FieldGrid>
      </div>
    );
  }
  if (field.kind === "repeatable") return renderRepeatableGridItem(field, mode, density, columns);
  return (
    <FieldGrid.Cell
      key={field.key}
      label={field.label}
      required={field.required}
      hint={field.hint ?? field.error}
      span={field.span}
      mode={mode}
      className={field.fieldClassName}
    >
      {renderFieldValue(field, density)}
    </FieldGrid.Cell>
  );
}

function renderLoginItem<T>(field: FormSurfaceItemSpec<T>): ReactNode {
  if (field.kind === "note") {
    return <FieldGrid.Note key={field.key} className={joinClassNames("px-0 py-0", field.className)}>{field.content}</FieldGrid.Note>;
  }
  if (field.kind === "groupTitle") {
    return <FieldGrid.GroupTitle key={field.key} className={joinClassNames("col-span-full", field.className)}>{field.title}</FieldGrid.GroupTitle>;
  }
  if (field.kind === "section" || field.kind === "repeatable") return renderGridItem(field, "mixed", "normal", 1);
  const controlField = {
    ...field,
    className: joinClassNames("w-full", field.className),
  } as FormSurfaceFieldSpec | FormSurfaceReadOnlyFieldSpec | FormSurfaceTagListFieldSpec<T>;
  return (
    <div key={field.key} className={joinClassNames("col-span-full min-w-0", field.fieldClassName)}>
      <div className="min-w-0 [&>*]:w-full [&_input]:w-full [&_textarea]:w-full">
        {renderFieldValue(controlField, "normal")}
      </div>
      {(field.hint || field.error) && (
        <div className="text-xs text-slate-400">{field.hint ?? field.error}</div>
      )}
    </div>
  );
}

function renderRepeatableGridItem<T>(
  field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>,
  mode: FieldGridMode,
  density: InputControlProps["density"],
  columns: 1 | 2 | 3,
) {
  return (
    <div key={field.key} className={joinClassNames("col-span-full space-y-3", field.className)}>
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
            <div key={item.key} ref={item.itemRef} className={joinClassNames("rounded-md border border-slate-200 p-3", item.className)}>
              {(item.title || item.subtitle || item.actions?.length) && (
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {item.title ? <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4> : null}
                    {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
                  </div>
                  {renderCommands(item.actions)}
                </div>
              )}
              <FieldGrid columns={field.columns ?? columns} mode={field.mode ?? mode}>
                {item.fields.map((nested) => renderGridItem(nested, field.mode ?? mode, density, field.columns ?? columns))}
              </FieldGrid>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderInlineItem<T>(field: FormSurfaceItemSpec<T>) {
  if (field.kind === "note") return <div key={field.key} className={joinClassNames("text-sm text-slate-500", field.className)}>{field.content}</div>;
  if (field.kind === "groupTitle") return <div key={field.key} className={joinClassNames("text-sm font-semibold text-slate-900", field.className)}>{field.title}</div>;
  if (field.kind === "section" || field.kind === "repeatable") {
    const mode = field.mode ?? "mixed";
    const columns = field.columns ?? 3;
    const headerActions = field.kind === "section"
      ? renderCommands(field.actions)
      : field.addAction ? renderCommands([field.addAction]) : null;
    return (
      <div key={field.key} className={joinClassNames("w-full basis-full space-y-2", field.className)}>
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
          <FieldGrid columns={columns} mode={mode} className={field.bodyClassName}>
            {field.fields.map((item) => renderGridItem(item, mode, "compact", columns))}
          </FieldGrid>
        ) : renderInlineRepeatable(field, mode, columns)}
      </div>
    );
  }
  return (
    <FormField key={field.key} label={field.label} required={field.required} hint={field.hint} error={field.error} layout="inline" className={field.fieldClassName}>
      {renderFieldValue(field, "compact")}
    </FormField>
  );
}

function renderInlineRepeatable<T>(field: Extract<FormSurfaceItemSpec<T>, { kind: "repeatable" }>, mode: FieldGridMode, columns: 1 | 2 | 3) {
  if (field.items.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-400">{field.empty ?? "暂无数据"}</div>;
  }
  return (
    <div className="space-y-2">
      {field.items.map((item) => (
        <div key={item.key} ref={item.itemRef} className={joinClassNames("rounded-md border border-slate-200 p-3", item.className)}>
          {(item.title || item.subtitle || item.actions?.length) && (
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                {item.title ? <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4> : null}
                {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
              </div>
              {renderCommands(item.actions)}
            </div>
          )}
          <FieldGrid columns={columns} mode={mode}>{item.fields.map((nested) => renderGridItem(nested, mode, "compact", columns))}</FieldGrid>
        </div>
      ))}
    </div>
  );
}

function renderFields<T>(props: FormSurfaceFieldModeProps<T>) {
  const fields = getFields(props);
  if (!fields.length) return null;
  if (props.kind === "inline" || props.kind === "filters") {
    return <div className="flex flex-wrap items-center gap-3">{fields.map(renderInlineItem)}</div>;
  }
  if (props.kind === "login") {
    return (
      <FieldGrid columns={1} mode="mixed" className={joinClassNames("w-full gap-4", props.bodyClassName)}>
        {fields.map(renderLoginItem)}
      </FieldGrid>
    );
  }
  const mode = props.mode ?? (props.kind === "detail" ? "detail" : "mixed");
  const density = props.kind === "detail" ? "compact" : "normal";
  return (
    <FieldGrid columns={props.columns} mode={mode} className={props.bodyClassName}>
      {fields.map((field) => renderGridItem(field, mode, density, props.columns ?? 3))}
    </FieldGrid>
  );
}

export function renderContent<T>(props: FormSurfaceFieldModeProps<T>) {
  return (
    <div className={joinClassNames("space-y-4", props.className)}>
      {renderFields(props)}
      {renderCommands(props.actions)}
    </div>
  );
}
