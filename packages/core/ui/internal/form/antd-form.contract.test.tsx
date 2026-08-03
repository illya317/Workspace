import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FormSurface from "../../FormSurface";
import { AntdFormCommands } from "./antd-form-actions";
import { AntdFormSurface } from "./antd-form";
import type {
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceProps,
} from "../../FormSurface.types";

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

function textField(key: string, label = key): FormSurfaceItemSpec {
  return {
    kind: "field",
    key,
    label,
    spec: { valueType: "string", control: "text" },
    value: "值",
  };
}

function surface(kind: FormSurfaceKind): FormSurfaceProps {
  return {
    kind,
    content: { items: [textField(`${kind}-field`, `${kind} 标签`)] },
  } as FormSurfaceProps;
}

test("renders all four public root kinds through the antd form renderer", () => {
  for (const kind of ["fields", "filters", "detail", "login"] as const) {
    const markup = renderClientSurface(<AntdFormSurface surface={surface(kind)} />);
    assert.match(markup, new RegExp(`data-form-root-kind="${kind}"`));
  }
});

test("renders every item kind, nested sections, and repeatable inline actions", () => {
  const items: FormSurfaceItemSpec<string>[] = [
    textField("field", "普通字段"),
    { kind: "readonly", key: "readonly", label: "只读字段", value: "只读值" },
    {
      kind: "tagList",
      key: "tag-list",
      label: "标签字段",
      items: ["标签甲"],
      getKey: (item) => item,
      getLabel: (item) => item,
      append: {
        referenceInput: {
          key: "append-reference",
          addLabel: "关联员工",
          fkKey: "employeeId",
          endpoint: "/api/employees",
          onAppend: () => undefined,
          create: {
            title: "新建员工",
            fields: [{
              kind: "field",
              key: "employee-name",
              label: "员工姓名",
              spec: { valueType: "string", control: "text" },
            }],
            submit: { key: "create-employee", label: "创建", type: "submit" },
          },
        },
      },
    },
    {
      kind: "tagList",
      key: "text-tag-list",
      label: "文本标签",
      items: [],
      getKey: (item: string) => item,
      getLabel: (item: string) => item,
      append: {
        textInput: {
          key: "append-text",
          addLabel: "新增文本",
          onAppend: () => undefined,
        },
      },
    },
    { kind: "note", key: "note", content: "辅助说明" },
    { kind: "groupTitle", key: "group", title: "字段分组" },
    {
      kind: "section",
      key: "section",
      title: "主区块",
      items: [{
        kind: "section",
        key: "nested-section",
        title: "嵌套区块",
        items: [textField("nested-field", "嵌套字段")],
      }],
    },
    {
      kind: "repeatable",
      key: "repeatable",
      title: "重复区",
      addAction: { key: "add-row", label: "新增行", presentation: "text", onClick: () => undefined },
      items: [{
        key: "row-1",
        items: [textField("row-name", "行名称")],
        actions: [{ key: "remove-row", label: "删除行", presentation: "text", onClick: () => undefined }],
      }],
    },
  ];
  const markup = renderClientSurface(<AntdFormSurface surface={{ kind: "fields", content: { items } }} />);

  for (const kind of ["field", "readonly", "tagList", "note", "groupTitle", "section", "repeatable"]) {
    assert.match(markup, new RegExp(`data-antd-form-item-kind="${kind}"`));
  }
  assert.match(markup, /data-form-section-frame="primary"/);
  assert.match(markup, /data-form-section-frame="nested"/);
  assert.match(markup, /data-form-repeatable-inline-actions="true"/);
  assert.match(markup, /新增行/);
  assert.match(markup, /删除行/);
  assert.match(markup, /关联员工/);
  assert.match(markup, /新增文本/);
});

test("shows labels in login and keeps validation error above hint", () => {
  const markup = renderClientSurface(<AntdFormSurface surface={{
    kind: "login",
    actions: [{ key: "login", action: "submit", label: "登录" }],
    content: {
      items: [{
        kind: "field",
        key: "account",
        label: "登录账号",
        spec: { valueType: "string", control: "text" },
        value: "值",
        required: true,
        hint: "请输入账号",
        error: "账号必填",
      }],
    },
  }} />);

  assert.match(markup, /登录账号/);
  assert.match(markup, />登录</);
  assert.match(markup, /账号必填/);
  assert.doesNotMatch(markup, /请输入账号/);
  assert.match(markup, /ant-form-item-required/);
});

test("keeps FormSurface as the only native form owner when submit lifecycle exists", () => {
  const withoutLifecycle = renderClientSurface(<FormSurface kind="fields" content={{ items: [textField("plain")] }} />);
  assert.equal((withoutLifecycle.match(/<form/g) ?? []).length, 0);

  const withLifecycle = renderClientSurface(<FormSurface
    kind="fields"
    submit={{ onSubmit: () => undefined }}
    actions={[{ key: "save", action: "save" }]}
    content={{
      items: [{
        kind: "section",
        key: "outer",
        items: [{ kind: "section", key: "inner", items: [textField("nested")] }],
      }],
    }}
  />);
  assert.equal((withLifecycle.match(/<form/g) ?? []).length, 1);
  assert.match(withLifecycle, /type="submit"/);
});

test("submit commands with click ownership never also submit the native form", () => {
  const markup = renderClientSurface(<AntdFormCommands commands={[
    { key: "native", label: "原生提交", presentation: "text", type: "submit" },
    { key: "owned", label: "事件提交", presentation: "text", type: "submit", onClick: () => undefined },
  ]} />);

  assert.equal((markup.match(/type="submit"/g) ?? []).length, 1);
  assert.equal((markup.match(/type="button"/g) ?? []).length, 1);
  assert.match(markup, /原生提交/);
  assert.match(markup, /事件提交/);
});

test("renders filter commands in inline and below placements", () => {
  const props = (placement: "inline" | "below"): FormSurfaceProps => ({
    kind: "filters",
    commands: [{ key: "query", label: "查询", presentation: "text" }],
    content: {
      items: [textField("keyword", "关键词")],
      layout: { flow: "inline", commandPlacement: placement },
    },
  });
  const inline = renderClientSurface(<AntdFormSurface surface={props("inline")} />);
  const below = renderClientSurface(<AntdFormSurface surface={props("below")} />);

  assert.match(inline, /data-antd-form-command-placement="inline"/);
  assert.doesNotMatch(inline, /data-antd-form-command-placement="below"/);
  assert.match(below, /data-antd-form-command-placement="below"/);
  assert.doesNotMatch(below, /data-antd-form-command-placement="inline"/);
  assert.match(inline, /查询/);
  assert.match(below, /查询/);
});

test("honors frame depth when resolving section chrome", () => {
  const props: FormSurfaceProps = {
    kind: "fields",
    content: {
      items: [{ kind: "section", key: "profile", title: "资料", items: [textField("name", "姓名")] }],
    },
  };
  const primary = renderClientSurface(<AntdFormSurface surface={props} insideFrame={false} />);
  const nested = renderClientSurface(<AntdFormSurface surface={props} insideFrame />);

  assert.match(primary, /data-form-section-frame="primary"/);
  assert.match(nested, /data-form-section-frame="nested"/);
});
