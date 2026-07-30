"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  fieldGridColumnsClass,
  getFieldGridCellClassName,
  getFieldGridHelperRowClassName,
  getFieldGridMainRowClassName,
  getFieldGridLabelClassName,
  getFieldGridValueClassName,
  getFieldGroupTitleClassName,
  getFieldHelperClassName,
} from "../form/FormStyles";
import { joinClassNames } from "../common/card-utils";
import { textOverflowTitle } from "../common/text-overflow";
import {
  resolveFieldGridInlineLabelWidth,
  resolveFieldGridStackLabelHeight,
} from "./field-grid-layout";

export type FieldGridMode = "view" | "edit" | "mixed" | "detail" | "control";
export type FieldGridFieldLayout = "inline" | "stack";

export interface FieldGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4 | 6;
  mode?: FieldGridMode;
  fieldLayout?: FieldGridFieldLayout;
  className?: string;
}

type FieldGridStyle = CSSProperties & {
  "--field-grid-label-width": string;
  "--field-grid-label-height": string;
};

function ownFieldGridElements<T extends HTMLElement>(root: HTMLDivElement, selector: string) {
  return Array.from(root.querySelectorAll<T>(selector))
    .filter((element) => element.closest("[data-field-grid-root]") === root);
}

function measureFieldGrid(root: HTMLDivElement, fieldLayout: FieldGridFieldLayout) {
  const labels = ownFieldGridElements<HTMLElement>(root, "[data-field-grid-label]");
  const labelTexts = ownFieldGridElements<HTMLElement>(root, "[data-field-grid-label-text]");
  if (fieldLayout === "stack") {
    const labelHeight = resolveFieldGridStackLabelHeight(
      labelTexts.map((element) => element.getBoundingClientRect().height),
    );
    root.style.setProperty("--field-grid-label-height", `${Math.ceil(labelHeight)}px`);
    labels.forEach((label) => label.removeAttribute("title"));
    return;
  }

  const cells = ownFieldGridElements<HTMLElement>(root, '[data-field-grid-span="1"]');
  const cellWidth = Math.min(
    root.getBoundingClientRect().width,
    ...cells.map((cell) => cell.getBoundingClientRect().width),
  );
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const naturalWidths = labelTexts.map((element) => {
    const label = element.closest<HTMLElement>("[data-field-grid-label]");
    const required = label?.querySelector<HTMLElement>("[data-field-grid-required]");
    return element.scrollWidth + (required?.getBoundingClientRect().width ?? 0);
  });
  const labelWidth = resolveFieldGridInlineLabelWidth({
    cellWidthPx: cellWidth,
    naturalLabelWidthsPx: naturalWidths,
    rootFontSizePx: rootFontSize,
  });
  root.style.setProperty("--field-grid-label-width", `${Math.ceil(labelWidth)}px`);

  labels.forEach((label) => {
    const text = label.querySelector<HTMLElement>("[data-field-grid-label-text]");
    const fullText = label.dataset.fieldGridLabelTitle;
    if (text && fullText && text.scrollWidth > text.clientWidth) label.title = fullText;
    else label.removeAttribute("title");
  });
}

function withSectionFieldLayout(children: ReactNode, fieldLayout: FieldGridFieldLayout) {
  return Children.map(children, (child) => {
    if (!isValidElement<FieldGridCellProps>(child) || child.type !== FieldGridCell) return child;
    return cloneElement(child, { fieldLayout });
  });
}

function FieldGridRoot({
  children,
  columns = 3,
  mode = "mixed",
  fieldLayout = "inline",
  className = "",
}: FieldGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => measureFieldGrid(root, fieldLayout);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    ownFieldGridElements<HTMLElement>(root, "[data-field-grid-label-text]").forEach((label) => observer.observe(label));
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [children, fieldLayout]);

  const style: FieldGridStyle = {
    "--field-grid-label-width": "5rem",
    "--field-grid-label-height": "1.25rem",
  };
  return (
    <div
      ref={rootRef}
      data-field-grid-root="true"
      data-field-grid-mode={mode}
      data-field-grid-layout={fieldLayout}
      style={style}
      className={joinClassNames("grid gap-2", fieldGridColumnsClass(columns), className)}
    >
      {withSectionFieldLayout(children, fieldLayout)}
    </div>
  );
}

// mode 目前作为 data-field-grid-mode 标记保留，供未来视觉契约扩展；
// 当前 FieldGrid 是“无自身外框”的 label/value 布局网格，内部控件自己提供 surface。
//
// 视觉契约：
// - Cell 由固定高度的 main row（label + value）和可选的 helper row 组成。
// - 一个 FieldGrid section 只允许一种 fieldLayout；单个 Cell 无权改变 section 格式。
// - inline 在整个 section 内共用自适应 label/value 轨道，溢出标签省略并通过 hover 展示全文。
// - stack 在整个 section 内统一改为 label 在上、value 在下，并共用同一个 label 区高度。
// - helper row 不参与 main row 行高，因此即使某个 cell 带有长说明，也不会让同行其它 cell 的 label/value 基线错位。
// - 需要跨列的独立整行说明，使用 FieldGrid.Note，而不是把长文本塞进单个 cell 的 hint。

export interface FieldGridCellProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  span?: "wide" | "full" | number;
  rowSpan?: 2 | 3;
  mode?: FieldGridMode;
  /** @internal FieldGridRoot always supplies the section-level value. */
  fieldLayout?: FieldGridFieldLayout;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

function fieldGridSpanClass(span: FieldGridCellProps["span"]) {
  if (span === "wide" || span === "full") return "col-span-full";
  if (span === 2) return "col-span-full sm:col-span-2";
  if (span === 3) return "col-span-full lg:col-span-3";
  return "";
}

function fieldGridRowSpanClass(rowSpan: FieldGridCellProps["rowSpan"]) {
  if (rowSpan === 2) return "row-span-2";
  if (rowSpan === 3) return "row-span-3";
  return "";
}

export function FieldGridCell({
  label,
  children,
  required,
  hint,
  span,
  rowSpan,
  mode = "mixed",
  className = "",
  labelClassName = "",
  valueClassName = "",
  fieldLayout = "inline",
}: FieldGridCellProps) {
  const spanClass = fieldGridSpanClass(span);
  const rowSpanClass = fieldGridRowSpanClass(rowSpan);
  if (mode === "control") {
    return (
      <div className={getFieldGridCellClassName(joinClassNames(spanClass, rowSpanClass, rowSpan ? "h-full" : "", "px-0 py-0.5", className))}>
        <div className={getFieldGridValueClassName(valueClassName, mode)}>
          {children}
        </div>
        {hint && <div className={getFieldHelperClassName()}>{hint}</div>}
      </div>
    );
  }
  return (
    <div
      data-field-grid-cell="true"
      data-field-grid-span={span ?? 1}
      className={getFieldGridCellClassName(joinClassNames(spanClass, rowSpanClass, rowSpan ? "h-full" : "", className))}
    >
      <div className={getFieldGridMainRowClassName(rowSpan ? "h-full" : "", mode, fieldLayout)}>
        <div
          data-field-grid-label="true"
          data-field-grid-label-title={textOverflowTitle(label)}
          className={getFieldGridLabelClassName(labelClassName, fieldLayout)}
          style={fieldLayout === "stack" ? { minHeight: "var(--field-grid-label-height)" } : undefined}
        >
          <span
            data-field-grid-label-text="true"
            className={joinClassNames("block min-w-0 max-w-full", fieldLayout === "inline" ? "sm:truncate" : "")}
          >
            {label}
          </span>
          {required && <span data-field-grid-required="true" className="ml-0.5 shrink-0 text-red-500">*</span>}
        </div>
        <div className={getFieldGridValueClassName(valueClassName, mode)}>
          {children}
        </div>
        {hint && (
          <div className={getFieldGridHelperRowClassName("", mode, fieldLayout)}>
            <div className={getFieldHelperClassName()}>{hint}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface FieldGridNoteProps {
  children: ReactNode;
  className?: string;
}

export function FieldGridNote({ children, className = "" }: FieldGridNoteProps) {
  return (
    <div className={joinClassNames("col-span-full px-3 py-1.5", getFieldHelperClassName(), className)}>
      {children}
    </div>
  );
}

export interface FieldGroupTitleProps {
  children: ReactNode;
  className?: string;
}

export function FieldGroupTitle({ children, className = "" }: FieldGroupTitleProps) {
  return <div className={getFieldGroupTitleClassName(className)}>{children}</div>;
}

export const FieldGrid = Object.assign(FieldGridRoot, {
  Cell: FieldGridCell,
  Note: FieldGridNote,
  GroupTitle: FieldGroupTitle,
});

export default FieldGrid;
