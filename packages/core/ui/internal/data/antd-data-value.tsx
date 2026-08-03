import { isValidElement, type ReactNode } from "react";
import { Progress, Tag } from "antd";
import AmountCell from "./AmountCell";
import NumberCell from "./NumberCell";
import type { DataSurfaceCellSpec, DataSurfaceDisplaySpec } from "../../DataSurface.types";
import { joinClassNames } from "../common/card-utils";
import { textOverflowTitle } from "../common/text-overflow";
import { resolveTableToneClass } from "./table-presentation";

const tagColors: Record<string, string> = {
  blue: "blue", emerald: "green", gray: "default", green: "green", orange: "orange",
  red: "red", sky: "cyan", slate: "default", yellow: "gold", amber: "gold",
};

const DISPLAY_KINDS = new Set(["text", "empty", "stack", "disclosure", "link", "badge", "number", "amount", "meter"]);

function isDisplaySpec(value: ReactNode | DataSurfaceCellSpec): value is DataSurfaceDisplaySpec {
  return Boolean(value && typeof value === "object" && !isValidElement(value) && "kind" in value && DISPLAY_KINDS.has(value.kind));
}

export function renderAntdDataValue(value: ReactNode | DataSurfaceCellSpec): ReactNode {
  if (!isDisplaySpec(value)) return value as ReactNode;
  if (value.kind === "empty") return <span className="text-slate-400">{value.content ?? "—"}</span>;
  if (value.kind === "badge") {
    const label = value.label ?? (value.level === undefined ? "—" : `L${value.level}`);
    return <Tag color={value.tone ? tagColors[value.tone] : "default"}>{label}</Tag>;
  }
  if (value.kind === "number") {
    const { kind: _kind, ...props } = value;
    return <span className="block w-full text-right tabular-nums"><NumberCell {...props} /></span>;
  }
  if (value.kind === "amount") {
    const { kind: _kind, ...props } = value;
    return <span className="block w-full text-right tabular-nums"><AmountCell {...props} /></span>;
  }
  if (value.kind === "meter") {
    const percent = value.max > 0 ? Math.round((value.value / value.max) * 100) : 0;
    return <span title={value.title}><Progress percent={percent} size="small" format={() => value.label} /></span>;
  }
  if (value.kind === "stack") {
    const gap = value.gap === "none" ? "gap-0" : value.gap === "sm" ? "gap-2" : "gap-1";
    return <span className={joinClassNames("inline-flex min-w-0 max-w-full flex-col", gap)}>{value.items.map((item, index) => <span className="min-w-0" key={index}>{renderAntdDataValue(item)}</span>)}</span>;
  }
  if (value.kind === "disclosure") {
    const emphasis = value.emphasis === "strong" ? "font-bold" : value.emphasis === "medium" ? "font-medium" : "";
    return (
      <span className={joinClassNames("flex min-w-0 items-center gap-1", emphasis)} style={{ paddingLeft: `${Math.max(0, value.level ?? 0)}rem` }}>
        <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">{value.expanded ? "▼" : "▶"}</span>
        <span className="min-w-0 truncate" title={textOverflowTitle(value.label)}>{value.label}</span>
      </span>
    );
  }
  if (value.kind === "link") {
    return <a className={joinClassNames("font-medium text-cyan-700 hover:underline", value.font === "mono" ? "font-mono" : "", resolveTableToneClass(value.tone))} href={value.href} target={value.external ? "_blank" : undefined} rel={value.external ? "noopener noreferrer" : undefined}>{value.label}</a>;
  }
  const emphasis = value.emphasis === "strong" ? "font-bold" : value.emphasis === "medium" ? "font-medium" : "";
  const font = value.font === "mono" ? "font-mono tabular-nums" : "";
  const wrap = value.wrap === "wrap" ? "block min-w-0 max-w-full whitespace-normal break-words" : value.wrap === "truncate" ? "block min-w-0 max-w-full truncate" : "";
  const maxChars = value.maxChars && value.maxChars > 0 ? Math.floor(value.maxChars) : undefined;
  return <span className={joinClassNames(resolveTableToneClass(value.tone), emphasis, font, wrap)} style={maxChars ? { maxWidth: `${maxChars}ch` } : undefined} title={value.title ?? (value.wrap === "truncate" ? textOverflowTitle(value.value) : undefined)}>{value.value}</span>;
}
