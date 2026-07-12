"use client";

import type { CSSProperties, ReactNode } from "react";
import { badgeToneClassName, type BadgeTone } from "../common/Badge";
import { joinClassNames } from "../common/card-utils";
import { ActionGlyph, type ActionGlyphKind } from "../action/ActionGlyphs";

export interface SelectionGridOption {
  value: string;
  label: string;
  code?: string;
  icon?: ActionGlyphKind;
  tone?: BadgeTone;
  title?: string;
}

export type SelectionGridMode = "select" | "readOnly" | "action";
export type SelectionGridLayout = "fixed" | "auto";
export type SelectionGridPresentation = "card" | "chip";
export type SelectionGridMinItemWidth = "sm" | "md" | "lg" | number;

export interface SelectionGridProps {
  options: SelectionGridOption[];
  value?: string | null;
  onChange?: (value: string) => void;
  mode?: SelectionGridMode;
  presentation?: SelectionGridPresentation;
  onItemClick?: (option: SelectionGridOption) => void;
  columns?: 1 | 2 | 3 | 4;
  layout?: SelectionGridLayout;
  minItemWidth?: SelectionGridMinItemWidth;
  /** 标签超长时单行省略；默认为 true，传 false 可恢复自动换行 */
  truncate?: boolean;
  disabled?: boolean;
  emptyText?: ReactNode;
  ariaLabel: string;
  className?: string;
}

const MIN_ITEM_WIDTH_MAP: Record<"sm" | "md" | "lg", number> = {
  sm: 120,
  md: 160,
  lg: 200,
};

function resolveMinItemWidth(minItemWidth: SelectionGridMinItemWidth = "md") {
  return typeof minItemWidth === "number" ? minItemWidth : MIN_ITEM_WIDTH_MAP[minItemWidth];
}

function columnsClass(columns: SelectionGridProps["columns"] = 3) {
  if (columns === 1) return "grid-cols-1";
  if (columns === 2) return "grid-cols-2";
  if (columns === 4) return "grid-cols-4";
  return "grid-cols-3";
}

function itemClasses(
  selected: boolean,
  interactive: boolean,
  presentation: SelectionGridPresentation,
  tone?: BadgeTone,
) {
  if (presentation === "chip") {
    return [
      "inline-flex min-w-0 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition",
      badgeToneClassName(tone ?? (selected ? "green" : "gray"), true),
      interactive ? "cursor-pointer" : "cursor-default",
    ].filter(Boolean).join(" ");
  }
  return [
    "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
    selected
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-700",
    interactive && !selected && "hover:border-slate-300 hover:bg-slate-50",
  ].filter(Boolean).join(" ");
}

function OptionContent({ option, truncate, presentation }: { option: SelectionGridOption; truncate?: boolean; presentation: SelectionGridPresentation }) {
  return (
    <>
      {option.icon ? <ActionGlyph kind={option.icon} className="h-3 w-3 shrink-0" /> : null}
      {option.code && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-blue-700">
          {option.code}
        </span>
      )}
      <span
        className={presentation === "chip" ? "min-w-0 truncate" : `min-w-0 flex-1 leading-5 ${truncate ? "truncate" : "break-words"}`}
        title={option.title ?? (truncate ? option.label : undefined)}
      >
        {option.label}
      </span>
    </>
  );
}

function gridStyle(layout: SelectionGridLayout, minItemWidth: SelectionGridMinItemWidth) {
  if (layout === "auto") {
    return {
      gridTemplateColumns: `repeat(auto-fit, minmax(${resolveMinItemWidth(minItemWidth)}px, 1fr))`,
    } as CSSProperties;
  }
  return undefined;
}

export default function SelectionGrid({
  options,
  value,
  onChange,
  mode = "select",
  presentation = "card",
  onItemClick,
  columns = 3,
  layout = "fixed",
  minItemWidth = "md",
  truncate = true,
  disabled,
  emptyText = "暂无选项",
  ariaLabel,
  className = "",
}: SelectionGridProps) {
  if (options.length === 0) {
    return <div className="text-sm text-slate-400">{emptyText}</div>;
  }

  const gridClass = presentation === "card" && layout === "fixed" ? columnsClass(columns) : "";
  const style = presentation === "card" ? gridStyle(layout, minItemWidth) : undefined;
  const containerClass = presentation === "chip"
    ? "flex flex-wrap items-center justify-center gap-1.5"
    : joinClassNames("grid gap-2", gridClass);

  if (mode === "readOnly") {
    return (
      <div
        role="list"
        aria-label={ariaLabel}
        style={style}
        className={joinClassNames(containerClass, className)}
      >
        {options.map((option) => (
          <div key={option.value} role="listitem" title={option.title} className={itemClasses(false, false, presentation, option.tone)}>
            <OptionContent option={option} truncate={truncate} presentation={presentation} />
          </div>
        ))}
      </div>
    );
  }

  if (mode === "action") {
    return (
      <div
        aria-label={ariaLabel}
        style={style}
        className={joinClassNames(containerClass, className)}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onItemClick?.(option)}
            title={option.title}
            className={itemClasses(false, !disabled, presentation, option.tone)}
          >
            <OptionContent option={option} truncate={truncate} presentation={presentation} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      style={style}
      className={joinClassNames(containerClass, className)}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange?.(option.value)}
            title={option.title}
            className={itemClasses(selected, true, presentation, option.tone)}
          >
            <OptionContent option={option} truncate={truncate} presentation={presentation} />
          </button>
        );
      })}
    </div>
  );
}
