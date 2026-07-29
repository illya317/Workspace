import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DataTable from "./DataTable";
import {
  resolveTableCellSelectionClass,
  resolveTableCellStateClass,
  resolveTableDisclosureClass,
} from "./table-presentation";

test("uses one Core visual language for horizontal and vertical disclosure", () => {
  assert.match(resolveTableDisclosureClass({
    axis: "column",
    role: "trigger",
    expanded: true,
    surface: "header",
    start: true,
  }), /bg-emerald-100/);
  assert.match(resolveTableDisclosureClass({ axis: "row", role: "detail" }), /bg-emerald-50/);
  assert.equal(resolveTableDisclosureClass({ axis: "column", role: "trigger", expanded: false }), "");
});

test("renders highlighted disclosure groups and expanded rows from semantic declarations", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let markup: string;
  try {
    markup = renderToStaticMarkup(
      <DataTable
        rows={[{ key: "row-1", total: 1, input: 1 }]}
        rowKey={(row) => row.key}
        visibleColumns={["total", "input"]}
        columns={[
          {
            key: "total",
            label: "边界",
            disclosure: { groupKey: "boundary", role: "trigger", expanded: true },
            onHeaderClick: () => undefined,
            render: (row) => row.total,
          },
          {
            key: "input",
            label: "输入",
            disclosure: { groupKey: "boundary", role: "detail" },
            render: (row) => row.input,
          },
        ]}
        expandedRowKey="row-1"
        renderExpandedRow={() => <div>详情</div>}
      />,
    );
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }

  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /data-disclosure-axis="column"/);
  assert.match(markup, /data-disclosure-role="detail"/);
  assert.match(markup, /data-disclosure-axis="row"/);
  assert.match(markup, /bg-emerald-100/);
  assert.match(markup, /bg-emerald-50/);
});

test("matrix semantic rows keep their state background instead of the normal white fill", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let markup: string;
  try {
    markup = renderToStaticMarkup(
      <DataTable
        rows={[{ key: "section", label: "共享与底座" }]}
        rowKey={(row) => row.key}
        format={{ kind: "matrix" }}
        rowState={() => "section"}
        columns={[{ key: "label", label: "模块", render: (row) => row.label }]}
      />,
    );
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }

  const sectionRowClass = markup.match(/<tr[^>]*class="([^"]*bg-slate-100[^"]*)"/)?.[1];
  assert.ok(sectionRowClass);
  assert.doesNotMatch(sectionRowClass, /bg-white/);
});

test("renders semantic relationship state on an individual matrix cell", () => {
  assert.match(resolveTableCellStateClass("info"), /!bg-sky-50/);
  assert.match(resolveTableCellStateClass("warning"), /!bg-amber-50/);
  assert.match(resolveTableCellStateClass("success"), /!bg-emerald-50/);
  assert.match(resolveTableCellStateClass("selected"), /ring-slate-400/);
  assert.match(resolveTableCellSelectionClass(true), /ring-slate-500/);

  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let markup: string;
  try {
    markup = renderToStaticMarkup(
      <DataTable
        rows={[{ key: "work", ui: 1, domain: 2 }]}
        rowKey={(row) => row.key}
        format={{ kind: "matrix" }}
        visibleColumns={["ui", "domain"]}
        columns={[
          { key: "ui", label: "UI", cellState: () => "warning", cellSelected: () => true, render: (row) => row.ui },
          { key: "domain", label: "业务", cellState: () => "info", render: (row) => row.domain },
        ]}
      />,
    );
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }

  assert.match(markup, /!bg-amber-50/);
  assert.match(markup, /ring-slate-500/);
  assert.match(markup, /!bg-sky-50/);
});
