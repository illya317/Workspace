import { isValidElement, type ReactNode } from "react";
import { Progress, Tag } from "antd";
import type { DataSurfaceCellSpec, DataSurfaceDisplaySpec } from "../../DataSurface.types";

const tagColors: Record<string, string> = {
  blue: "blue",
  emerald: "green",
  gray: "default",
  green: "green",
  orange: "orange",
  red: "red",
  sky: "cyan",
  slate: "default",
  yellow: "gold",
  amber: "gold",
};

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions, empty = "—") {
  if (value === null || value === undefined) return empty;
  return new Intl.NumberFormat("zh-CN", options).format(value);
}

function isDisplaySpec(value: ReactNode | DataSurfaceCellSpec): value is DataSurfaceDisplaySpec {
  return value !== null && value !== undefined && typeof value === "object" && !isValidElement(value) && "kind" in value;
}

export function renderAntdAnalyticsValue(value: ReactNode | DataSurfaceCellSpec): ReactNode {
  if (!isDisplaySpec(value)) return value as ReactNode;

  if (value.kind === "text") {
    const toneClass = {
      default: "text-inherit",
      muted: "text-slate-500",
      success: "text-green-700",
      warning: "text-amber-700",
      danger: "text-red-700",
      info: "text-sky-700",
    }[value.tone ?? "default"];
    return <span className={toneClass}>{value.value}</span>;
  }
  if (value.kind === "empty") return value.content ?? "—";
  if (value.kind === "badge") {
    const label = value.label ?? (value.level === undefined ? "—" : `L${value.level}`);
    return <Tag color={value.tone ? tagColors[value.tone] : "default"}>{label}</Tag>;
  }
  if (value.kind === "number") {
    return formatNumber(value.value, {
      minimumFractionDigits: value.minimumFractionDigits,
      maximumFractionDigits: value.maximumFractionDigits,
    }, value.empty);
  }
  if (value.kind === "amount") {
    const amount = formatNumber(value.value, {
      minimumFractionDigits: value.minimumFractionDigits,
      maximumFractionDigits: value.maximumFractionDigits,
    });
    return value.value === null || value.value === undefined ? amount : `${value.currencySymbol ?? "¥"}${amount}`;
  }
  if (value.kind === "link") {
    return <a href={value.href} target={value.external ? "_blank" : undefined} rel={value.external ? "noreferrer" : undefined}>{value.label}</a>;
  }
  if (value.kind === "stack") {
    return <span className="inline-flex flex-col gap-0.5">{value.items.map((item, index) => <span key={index}>{renderAntdAnalyticsValue(item)}</span>)}</span>;
  }
  if (value.kind === "meter") {
    const percent = value.max > 0 ? Math.round((value.value / value.max) * 100) : 0;
    return <Progress percent={percent} size="small" format={() => value.label} />;
  }
  if (value.kind === "disclosure") return value.label;
  return null;
}
