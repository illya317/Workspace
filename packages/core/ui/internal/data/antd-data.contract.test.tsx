import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import { AntdDataTable } from "./antd-data-table";
import { AntdStructuredTable } from "./antd-data-structured";
import { AntdDataSurface } from "./antd-data";
import { renderAntdDataCell } from "./antd-data-cell";
import type {
  DataSurfaceStructuredProps,
  DataSurfaceTableProps,
} from "../../DataSurface.types";

function renderClientSurface(node: React.ReactNode) {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  try {
    return renderToStaticMarkup(node);
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
}

function RenderDataCell({ value }: { value: Parameters<typeof renderAntdDataCell>[0] }) {
  return renderAntdDataCell(value);
}

function tableProps(overrides: Partial<DataSurfaceTableProps<Record<string, unknown>>>): DataSurfaceTableProps<Record<string, unknown>> {
  return {
    kind: "table",
    rows: [
      { id: 1, name: "行一" },
      { id: 2, name: "行二" },
    ],
    columns: [{ key: "name", label: "姓名", required: true, cell: (row) => String(row.name ?? "") }],
    rowKey: (row) => String(row.id),
    ...overrides,
  };
}

test("renders the mobile list presentation alongside the desktop table", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, name: "行一", dept: "部门一", title: "岗位一", city: "城市一", level: "级别一" }],
    columns: [
      { key: "name", label: "姓名", required: true, cell: (row) => String(row.name ?? "") },
      { key: "dept", label: "部门", required: true, cell: (row) => String(row.dept ?? "") },
      { key: "title", label: "岗位", required: true, cell: (row) => String(row.title ?? "") },
      { key: "city", label: "城市", required: true, cell: (row) => String(row.city ?? "") },
      { key: "level", label: "级别", required: true, cell: (row) => String(row.level ?? "") },
    ],
    onRowClick: () => undefined,
  })} />);

  assert.match(markup, /data-mobile-table-presentation="list"/);
  assert.match(markup, /data-desktop-table="true"/);
  assert.match(markup, /更多信息/);
});

test("keeps landscape mobile matrices on the desktop table with a rotatable wrapper", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    format: { kind: "matrix" },
    mobile: { presentation: "landscape", title: "交叉矩阵", reason: "矩阵列较多" },
  })} />);

  assert.match(markup, /landscape:max-sm:block/);
  assert.ok(!markup.includes('data-mobile-table-presentation="list"'));
});

test("maps presentation stripe, cellWrap, header, and rowHover contracts", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    presentation: { stripe: "subtle", cellWrap: "wrap", header: "strong", rowHover: "none" },
  })} />);

  assert.match(markup, /bg-slate-50\/50/);
  assert.match(markup, /whitespace-normal/);
  assert.match(markup, /!bg-slate-100/);
  assert.match(markup, /!bg-transparent/);
});

test("maps scroll and frame contracts onto the wrapper", () => {
  const hidden = renderClientSurface(<AntdDataTable data={tableProps({ scroll: { y: "hidden" } })} />);
  assert.match(hidden, /overflow-y-hidden/);

  const maxHeight = renderClientSurface(<AntdDataTable data={tableProps({ scroll: { maxHeight: "sm" } })} />);
  assert.match(maxHeight, /320/);

  const bordered = renderClientSurface(<AntdDataTable data={tableProps({ frame: "bordered" })} />);
  assert.match(bordered, /border border-slate-200/);

  const plain = renderClientSurface(<AntdDataTable data={tableProps({ frame: "plain" })} />);
  assert.ok(!plain.includes("border border-slate-200"));
});

test("maps rowState semantics onto table rows", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    rowState: (row) => (row.id === 2 ? "danger" : "normal"),
  })} />);

  assert.match(markup, /!bg-red-50/);
  assert.match(markup, /!text-red-900/);
});

test("row actions render semantic icon-only Ant buttons with accessible labels and variants", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, name: "行一" }],
    rowActions: () => [
      { key: "save", kind: "save", label: "保存行", onClick: () => undefined },
      { key: "delete", kind: "delete", label: "删除行", onClick: () => undefined },
    ],
  })} />);

  assert.match(markup, /aria-label="保存行"/);
  assert.match(markup, /title="保存行"/);
  assert.match(markup, /aria-label="删除行"/);
  assert.match(markup, /ant-btn-primary/);
  assert.match(markup, /ant-btn-dangerous/);
  assert.doesNotMatch(markup, />保存行<|>删除行</);
});

test("table columns reuse shared width tokens and apply numeric defaults", () => {
  const source = readFileSync(new URL("./antd-data-table.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveTableColumnWidthValue\(column\.width \?\? \(column\.numeric \? "sm" : undefined\)\)/);
  assert.doesNotMatch(source, /function columnWidth/);

  const contentWidth = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, compact: "短值" }],
    columns: [{ key: "compact", label: "紧凑列", required: true, width: "content", cell: (row) => String(row.compact ?? "") }],
  })} />);
  assert.match(contentWidth, /width:1px/);

  const numericDefault = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, amount: 42 }],
    columns: [{ key: "amount", label: "金额", required: true, numeric: true, cell: (row) => Number(row.amount ?? 0) }],
  })} />);
  assert.match(numericDefault, /width:7rem/);
  assert.match(numericDefault, /text-align:right/);
  assert.match(numericDefault, /font-mono/);
  assert.match(numericDefault, /tabular-nums/);
});

test("explicit numeric alignment and font override their defaults", () => {
  const markup = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, amount: 42 }],
    columns: [{
      key: "amount",
      label: "金额",
      required: true,
      numeric: true,
      align: "left",
      font: "default",
      cell: (row) => Number(row.amount ?? 0),
    }],
  })} />);

  assert.match(markup, /width:7rem/);
  assert.match(markup, /text-align:left/);
  assert.doesNotMatch(markup, /font-mono/);
  assert.doesNotMatch(markup, /tabular-nums/);

  const explicitMono = renderClientSurface(<AntdDataTable data={tableProps({
    rows: [{ id: 1, code: "A-001" }],
    columns: [{
      key: "code",
      label: "编码",
      required: true,
      font: "mono",
      cell: (row) => String(row.code ?? ""),
    }],
  })} />);

  assert.match(explicitMono, /font-mono/);
  assert.match(explicitMono, /tabular-nums/);
});

test("uses the antd v6 Table medium size while preserving numeric Space gap tokens", () => {
  const tableSource = readFileSync(new URL("./antd-data-table.tsx", import.meta.url), "utf8");
  const structuredSource = readFileSync(new URL("./antd-data-structured.tsx", import.meta.url), "utf8");

  for (const source of [tableSource, structuredSource]) {
    assert.match(source, /presentation\.density === "compact" \? "small" : "medium"/);
    assert.doesNotMatch(source, /presentation\.density === "compact" \? "small" : "middle"/);
  }
  assert.match(tableSource, /<Space size=\{4\} wrap>/);
});

test("renders structured spans, sticky first column, and explicit sizing", () => {
  const data: DataSurfaceStructuredProps = {
    kind: "structured",
    colWidths: [112, 96],
    rows: [
      [
        { header: true, content: { kind: "text", value: "员工" } },
        { header: true, content: { kind: "text", value: "岗位" } },
      ],
      [
        { rowHeight: 64, width: 112, content: { kind: "text", value: "员工一" } },
        { content: { kind: "text", value: "主岗" } },
      ],
    ],
  };
  const markup = renderClientSurface(<AntdStructuredTable data={data} />);

  assert.match(markup, /sticky left-0/);
  assert.match(markup, /border-r border-slate-200/);
  assert.doesNotMatch(markup, /shadow-\[8px_0/);
  assert.match(markup, /height:64px/);
  assert.match(markup, /width:112/);
});

test("structured header and data cells preserve native table semantics", () => {
  const data: DataSurfaceStructuredProps = {
    kind: "structured",
    format: { kind: "matrix" },
    scroll: { maxHeight: "sm" },
    rowInteractions: [null, { ariaLabel: "打开员工一", onClick: () => undefined }],
    rows: [
      [
        { header: true, content: { kind: "text", value: "员工" } },
        { header: true, content: { kind: "text", value: "岗位" } },
      ],
      [
        { content: { kind: "text", value: "员工一" } },
        { content: { kind: "text", value: "主岗" } },
      ],
    ],
  };
  const markup = renderClientSurface(<AntdStructuredTable data={data} />);

  assert.match(markup, /<th[^>]*>[\s\S]*?员工[\s\S]*?<\/th>/);
  assert.match(markup, /<td[^>]*>[\s\S]*?员工一[\s\S]*?<\/td>/);
  assert.match(markup, /<th/);
  assert.match(markup, /<td/);
  assert.match(markup, /aria-label="打开员工一"/);
  assert.match(markup, /role="button"/);
  assert.match(markup, /min-h-\[56px\]/);
  assert.match(markup, /320/);
});

test("renders structured mobile list cards from a simple header row", () => {
  const data: DataSurfaceStructuredProps = {
    kind: "structured",
    rows: [
      [
        { header: true, content: { kind: "text", value: "员工" } },
        { header: true, content: { kind: "text", value: "部门" } },
      ],
      [
        { content: { kind: "text", value: "员工一" } },
        { content: { kind: "text", value: "部门一" } },
      ],
    ],
  };
  const markup = renderClientSurface(<AntdStructuredTable data={data} />);

  assert.match(markup, /data-mobile-table-presentation="list"/);
  assert.match(markup, /员工一/);
});

test("matrix structured tables default to fillRow and a bordered matrix frame", () => {
  const data: DataSurfaceStructuredProps = {
    kind: "structured",
    format: { kind: "matrix", columnWidths: ["10rem", "8rem"] },
    rows: [
      [
        { header: true, content: { kind: "text", value: "员工" } },
        { header: true, content: { kind: "text", value: "一月" } },
      ],
      [
        { content: { kind: "text", value: "员工一" } },
        { content: { kind: "text", value: "12" } },
      ],
    ],
  };
  const markup = renderClientSurface(<AntdStructuredTable data={data} />);

  assert.match(markup, /min-h-\[56px\]/);
  assert.match(markup, /border border-slate-200/);
});

test("wrap false renders only data content and does not leak surface actions", () => {
  const markup = renderClientSurface(<AntdDataSurface data={{
    kind: "summary",
    wrap: false,
    actions: [{ key: "export", label: "不应显示的导出", onClick: () => undefined }],
    metrics: [{ key: "count", label: "总数", value: 3 }],
  }} />);
  assert.match(markup, /总数/);
  assert.doesNotMatch(markup, /不应显示的导出/);
});

test("the Ant cell dispatcher is total for every public cell discriminant", () => {
  const source = readFileSync(new URL("./antd-data-cell.tsx", import.meta.url), "utf8");
  const registered = new Set((/const CELL_KINDS = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1] ?? "")
    .match(/"[^"]+"/g)?.map((value) => value.slice(1, -1)) ?? []);
  for (const kind of [
    "text", "empty", "stack", "disclosure", "link", "badge", "number", "amount", "meter",
    "input", "group", "selectionGrid", "data", "form", "create-trigger", "create-anchor",
    "interactive", "action", "actions",
  ]) {
    assert.ok(registered.has(kind), kind);
  }
  assert.doesNotMatch(source, /DataSurface\.renderers/);
  assert.doesNotMatch(source, /from "\.\/antd-data"/);
});

test("nested data cells resolve through the provider without a module cycle", () => {
  const markup = renderClientSurface(<AntdDataSurface data={tableProps({
    rows: [{ id: 1 }],
    columns: [{
      key: "nested",
      label: "嵌套指标",
      required: true,
      cell: () => ({
        kind: "data",
        data: { kind: "summary", metrics: [{ key: "count", label: "子项数量", value: 2 }] },
      }),
    }],
  })} />);
  assert.match(markup, /子项数量/);
});

test("cell input maps invalid state and actions preserve submit, tone, and truncate semantics", () => {
  const invalid = renderClientSurface(<RenderDataCell value={{
    kind: "input",
    spec: { valueType: "string", control: "text" },
    value: "错误值",
    invalid: true,
  }} />);
  assert.match(invalid, /ant-input-status-error|aria-invalid/);

  const callbackSubmit = renderClientSurface(<RenderDataCell value={{
    kind: "action",
    action: { key: "submit-callback", label: "回调提交", type: "submit", onClick: () => undefined, tone: "amber", truncate: true },
  }} />);
  assert.match(callbackSubmit, /type="button"/);
  assert.match(callbackSubmit, /max-w-40 truncate/);

  const nativeSubmit = renderClientSurface(<RenderDataCell value={{
    kind: "action",
    action: { key: "submit-native", label: "原生提交", type: "submit", tone: "sky" },
  }} />);
  assert.match(nativeSubmit, /type="submit"/);
});

test("interactive cells guard keyboard activation at the wrapper boundary", () => {
  const source = readFileSync(new URL("./antd-data-cell.tsx", import.meta.url), "utf8");
  assert.match(source, /event\.target !== event\.currentTarget/);
});
