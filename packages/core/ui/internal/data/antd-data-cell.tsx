"use client";

import { Button, Space } from "antd";
import { createContext, isValidElement, useContext, type ReactNode } from "react";
import CreateSurface from "../../CreateSurface";
import FormSurface from "../../FormSurface";
import { InputSurfaceRenderer } from "../../InputSurface";
import type { DataSurfaceCellActionSpec, DataSurfaceCellSpec, DataSurfaceProps } from "../../DataSurface.types";
import { ActionGlyph } from "../action/ActionGlyphs";
import { CreateSurfaceAnchorTarget } from "../create/CreateSurfaceAnchorContext";
import SelectionGrid from "../selection/SelectionGrid";
import { joinClassNames } from "../common/card-utils";
import { renderAntdDataValue } from "./antd-data-value";

const CELL_KINDS = new Set([
  "text", "empty", "stack", "disclosure", "link", "badge", "number", "amount", "meter",
  "input", "group", "data", "form", "create-trigger", "create-anchor", "interactive",
  "selectionGrid", "action", "actions",
]);

function isCellSpec(value: ReactNode | DataSurfaceCellSpec): value is DataSurfaceCellSpec {
  return Boolean(value && typeof value === "object" && !isValidElement(value) && "kind" in value && CELL_KINDS.has(value.kind));
}

function labelText(label: ReactNode) {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

function AntdCellAction({ action }: { action: DataSurfaceCellActionSpec }) {
  const label = labelText(action.label) || action.key;
  const toneColor = action.tone ? ({
    gray: "default", green: "green", blue: "blue", red: "red", yellow: "gold",
    orange: "orange", emerald: "green", sky: "cyan", slate: "default", amber: "gold",
  } as const)[action.tone] : undefined;
  return (
    <span
      className="inline-flex"
      onClick={action.stopPropagation === false ? undefined : (event) => event.stopPropagation()}
      onMouseEnter={action.onMouseEnter}
      onMouseLeave={action.onMouseLeave}
    >
      <Button
        aria-label={action.presentation === "glyph" ? label : undefined}
        color={toneColor}
        danger={action.variant === "danger" || action.tone === "red"}
        disabled={action.disabled}
        htmlType={action.type === "submit" && !action.onClick ? "submit" : "button"}
        icon={action.icon ? <ActionGlyph kind={action.icon} className="size-4" /> : undefined}
        onClick={action.onClick}
        size={action.size === "lg" ? "large" : action.size === "sm" ? "small" : "middle"}
        title={action.title ?? label}
        type={action.variant === "primary" ? "primary" : action.presentation === "glyph" ? "text" : "default"}
        variant={toneColor ? action.presentation === "glyph" ? "text" : "outlined" : undefined}
      >
        {action.presentation === "glyph" ? null : <span className={action.truncate ? "block max-w-40 truncate" : undefined}>{action.label}</span>}
      </Button>
    </span>
  );
}

function groupItemClassName(item: DataSurfaceCellSpec, direction: "row" | "column") {
  if (direction === "row" && item.kind === "text" && item.wrap) return "min-w-0 flex-1";
  return direction === "column" ? "min-w-0 w-full" : "min-w-0";
}

/** Total Ant cell dispatcher. Embedded Form/Create/Input remain their governed public surfaces. */
type NestedDataRenderer = (data: DataSurfaceProps) => ReactNode;
const NestedDataRendererContext = createContext<NestedDataRenderer | null>(null);

export function AntdDataCellProvider({ children, renderNestedData }: { children: ReactNode; renderNestedData: NestedDataRenderer }) {
  return <NestedDataRendererContext.Provider value={renderNestedData}>{children}</NestedDataRendererContext.Provider>;
}

export function AntdDataCell({ value }: { value: ReactNode | DataSurfaceCellSpec }) {
  return <>{renderAntdDataCell(value, useContext(NestedDataRendererContext) ?? undefined)}</>;
}

export function renderAntdDataCell(value: ReactNode | DataSurfaceCellSpec, renderNestedData?: NestedDataRenderer): ReactNode {
  if (!isCellSpec(value)) return value;
  if (value.kind === "input") {
    const { kind: _kind, stopPropagation, fillRow, autoGrow, verticalAlign, textAlign, invalid, ...props } = value;
    const control = (
      <InputSurfaceRenderer
        {...props}
        textAlign={textAlign}
        visualState={invalid ? "error" : undefined}
        className={joinClassNames(
          fillRow ? "h-full min-h-[56px]" : "",
          autoGrow ? "[field-sizing:content]" : "",
          verticalAlign === "center" ? "content-center" : "",
          textAlign === "center" ? "text-center" : textAlign === "right" ? "text-right" : "",
        )}
      />
    );
    return stopPropagation === false ? control : <div className={fillRow ? "block h-full w-full" : "block"} onClick={(event) => event.stopPropagation()}>{control}</div>;
  }
  if (value.kind === "selectionGrid") {
    const { kind: _kind, ...props } = value;
    return <div className="block" onClick={(event) => event.stopPropagation()}><SelectionGrid {...props} /></div>;
  }
  if (value.kind === "group") {
    const direction = value.direction ?? "row";
    return (
      <div className={direction === "column" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
        {value.items.map((item, index) => <div className={groupItemClassName(item, direction)} key={index}>{renderAntdDataCell(item, renderNestedData)}</div>)}
      </div>
    );
  }
  if (value.kind === "data") return renderNestedData?.(value.data) ?? null;
  if (value.kind === "form") return <FormSurface {...value.form} />;
  if (value.kind === "create-trigger") return <CreateSurface {...value.create} />;
  if (value.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={value.anchor} />;
  if (value.kind === "interactive") {
    return (
      <div
        aria-label={value.ariaLabel}
        onClick={(event) => { event.stopPropagation(); value.onClick(); }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); value.onClick(); }
        }}
        onMouseEnter={value.onMouseEnter}
        onMouseLeave={value.onMouseLeave}
        role="button"
        tabIndex={0}
      >
        {renderAntdDataCell(value.content, renderNestedData)}
      </div>
    );
  }
  if (value.kind === "action") return <AntdCellAction action={value.action} />;
  if (value.kind === "actions") {
    return (
      <Space className={value.align === "center" ? "justify-center" : value.align === "right" ? "justify-end" : "justify-start"} size={8} wrap>
        {value.actions.map((action) => <AntdCellAction action={action} key={action.key} />)}
      </Space>
    );
  }
  return renderAntdDataValue(value);
}
