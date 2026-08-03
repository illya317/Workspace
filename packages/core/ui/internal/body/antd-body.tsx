"use client";

import {
  Alert,
  Card,
  Empty,
  Input,
  Select,
  Skeleton,
  Tag,
  type SelectProps,
} from "antd";
import BodySurface from "../../BodySurface";
import FormSurface from "../../FormSurface";
import VisualizationSurface from "../../VisualizationSurface";
import type {
  BodySurfaceBadgeSpec,
  BodySurfaceComposedSectionProps,
  BodySurfaceEmptySpec,
  BodySurfaceMessageSpec,
  BodySurfaceModalSpec,
  BodySurfaceSectionBodyProps,
  BodySurfaceSectionGridColumns,
  BodySurfaceSectionSpec,
  BodySurfaceSectionVisibility,
  BodySurfaceStatusSpec,
} from "../../BodySurface.types";
import type { DataSurfaceProps } from "../../DataSurface.types";
import type { FormSurfaceFieldSpec, FormSurfaceProps } from "../../FormSurface.types";
import { CreateStartButton } from "../action/CreateActionControls";
import { renderModuleGrid } from "./BodySurfaceBlocks";
import { BodySurfaceList } from "./BodySurfaceList";
import { BodySurfaceRevealProvider } from "./BodySurfaceRevealContext";
import { BodySurfaceSectionFrame } from "./BodySurfaceSectionParts";
import { AntdDataSurface } from "../data/antd-data";
import { renderCommands } from "../page/PageSurface.commands";

const BADGE_TAG_COLOR: Record<NonNullable<BodySurfaceBadgeSpec["tone"]>, string | undefined> = {
  default: undefined,
  muted: undefined,
  info: "blue",
  success: "green",
  warning: "gold",
  danger: "red",
};

function visibilityClassName(visibility: BodySurfaceSectionVisibility | undefined) {
  if (visibility === "desktop") return "max-md:hidden";
  if (visibility === "mobile") return "hidden max-md:block";
  return "";
}

function renderAntdMessage(message?: BodySurfaceMessageSpec) {
  if (!message) return null;
  const content = (
    <>
      {message.content}
      {message.link ? <a className="ml-2 font-medium underline" href={message.link.href}>{message.link.label}</a> : null}
    </>
  );
  if (message.presentation === "plain") {
    return <div key="message" className="text-sm text-slate-600">{content}</div>;
  }
  const type = message.tone === "danger"
    ? "error"
    : message.tone === "warning"
      ? "warning"
      : message.tone === "success"
        ? "success"
        : "info";
  return <Alert key="message" title={content} type={type} showIcon />;
}

function renderAntdStatus(status?: BodySurfaceStatusSpec) {
  if (!status) return null;
  if (status.kind === "loading") {
    // Skeleton 无卡片边距,legacy 的 compact 仅压缩卡片内边距,此处无对应视觉差异。
    return <Skeleton key="status" active />;
  }
  if (status.kind === "error") {
    return <Alert key="status" className={status.compact ? "!py-1.5" : undefined} title={status.content} type="error" showIcon />;
  }
  return (
    <Empty
      key="status"
      description={status.content}
      image={status.compact ? Empty.PRESENTED_IMAGE_SIMPLE : undefined}
    />
  );
}

function renderAntdEmpty(empty?: BodySurfaceEmptySpec) {
  if (!empty) return null;
  if (empty.presentation === "plain") {
    return <div key="empty" className="text-sm text-slate-500">{empty.content}</div>;
  }
  return (
    <Empty
      key="empty"
      description={empty.content}
      image={empty.compact ? Empty.PRESENTED_IMAGE_SIMPLE : undefined}
    />
  );
}

// modal 块(DetailModal + 内部 sections + 分页/动作 footer)无对应 antd 子集,
// 显式 fail-closed 委托 legacy BodySurface 只渲染 modals,其余块仍走 antd。
function AntdBodyModals({ modals }: { modals?: BodySurfaceModalSpec[] }) {
  if (!modals?.length) return null;
  return <BodySurface kind="section" modals={modals} />;
}

function staticOptions(field: FormSurfaceFieldSpec): SelectProps["options"] {
  const options = field.spec.options;
  if (!options || options.source === "none" || options.source === "remote") return [];
  if (options.source === "static") return options.items.map((item) => ({ label: item.label, value: item.value, disabled: item.disabled }));
  return options.groups.map((group) => ({
    label: group.label,
    options: group.options.map((item) => ({ label: item.label, value: item.value })),
  }));
}

function fieldDisabled(field: FormSurfaceFieldSpec) {
  const states = Array.isArray(field.spec.state) ? field.spec.state : field.spec.state ? [field.spec.state] : [];
  return Boolean(field.disabled || states.includes("disabled") || states.includes("readonly"));
}

function AntdFiltersForm({ form }: { form: FormSurfaceProps }) {
  if (form.kind !== "filters") return <FormSurface {...form} />;
  if (form.content.items.some((item) => item.kind && item.kind !== "field" && item.kind !== "readonly")) {
    return <FormSurface {...form} />;
  }
  // actions/submit/layout 超出 antd filters 简单子集(涉及 form 提交语义与网格布局),
  // 显式 fail-closed 委托 legacy FormSurface。
  if (form.actions?.length || form.submit || form.content.layout) {
    return <FormSurface {...form} />;
  }
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {form.header?.title || form.header?.description ? (
        <div className="mb-3 space-y-1">
          {form.header.title ? <h3 className="text-sm font-semibold text-slate-900">{form.header.title}</h3> : null}
          {form.header.description ? <p className="text-xs text-slate-500">{form.header.description}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        {form.content.items.map((item) => {
          if (item.kind === "readonly") {
            return <div className="grid gap-1 px-1 py-0.5 text-xs text-slate-500 max-md:w-full" key={item.key}><span>{item.label}</span><strong className="text-sm font-semibold text-slate-700">{item.value}</strong></div>;
          }
          const field = item as FormSurfaceFieldSpec;
          const control = field.spec.control;
          return (
            <label className="grid min-w-52 gap-1.5 text-xs font-semibold text-slate-600 max-md:w-full max-md:min-w-0 [&_.ant-input]:w-full [&_.ant-input]:font-normal [&_.ant-select]:w-full [&_.ant-select]:font-normal" key={field.key}>
              <span>{field.label}</span>
              {control === "choice" ? (
                <Select
                  allowClear={!field.required}
                  disabled={fieldDisabled(field)}
                  mode={field.spec.multiple ? "multiple" : undefined}
                  onChange={(value) => field.onChange?.(value)}
                  options={staticOptions(field)}
                  placeholder={field.placeholder}
                  showSearch
                  value={field.value === "" ? undefined : field.value}
                />
              ) : (
                <Input
                  disabled={fieldDisabled(field)}
                  onChange={(event) => field.onChange?.(event.target.value)}
                  placeholder={field.placeholder}
                  value={String(field.value ?? "")}
                />
              )}
            </label>
          );
        })}
        {renderCommands(form.commands)}
      </div>
    </div>
  );
}

function AntdSectionBody({ body }: { body: BodySurfaceSectionBodyProps }) {
  if (body.kind === "data") {
    return <AntdDataSurface data={body.data as DataSurfaceProps<Record<string, unknown>>} />;
  }
  if (body.kind === "form") return <AntdFiltersForm form={body.form} />;
  if (body.kind === "visualization") return <div className="min-h-30"><VisualizationSurface {...body.visualization} /></div>;
  if (body.kind !== "section") return <BodySurface {...body} />;
  // split 布局与 title/commands 的框架语义不在 antd 子集内,fail-closed 委托 legacy。
  if (body.layout === "split" || body.title || body.commands?.length) {
    return <BodySurface {...body} />;
  }
  return <AntdComposedBody body={body} />;
}

function AntdBodySection({ section }: { section: BodySurfaceSectionSpec }) {
  const header = section.header;
  const disclosure = section.disclosure;
  // header.create 的 block 变体依赖 CreateSurface anchor 上下文,fail-closed 委托 legacy 渲染该 section。
  if (header?.create?.presentation === "block") {
    return <BodySurface kind="section" sections={[section]} />;
  }
  const title = header?.title ?? section.label;
  const create = header?.create;
  const createButton = create?.presentation === "row" && create.canCreate !== false ? (
    <CreateStartButton label={create.title} disabled={create.disabled} onClick={create.onCreate} size="sm" />
  ) : null;
  const badges = header?.badges?.length ? (
    <span className="flex flex-wrap items-center gap-1.5">
      {header.badges.map((badge) => (
        <Tag key={badge.key} className="m-0" color={BADGE_TAG_COLOR[badge.tone ?? "default"]}>{badge.label}</Tag>
      ))}
    </span>
  ) : null;
  const titleNode = disclosure ? (
    <button
      type="button"
      aria-expanded={disclosure.expanded}
      className="flex min-w-0 items-center gap-2 text-left"
      onClick={() => disclosure.onExpandedChange(!disclosure.expanded)}
    >
      <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">{disclosure.expanded ? "▼" : "▶"}</span>
      {title ? <span className="truncate">{title}</span> : null}
      {badges}
    </button>
  ) : (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {title ? <span className="truncate">{title}</span> : null}
      {badges}
    </span>
  );
  const extra = header?.actions?.length || createButton ? (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {createButton}
      {renderCommands(header?.actions)}
    </div>
  ) : undefined;
  const hasHeader = Boolean(title || badges || header?.actions?.length || createButton || disclosure);
  // 与 legacy 一致:受控折叠,收起时不渲染内容。
  const content = !disclosure || disclosure.expanded ? <AntdSectionBody body={section.body} /> : null;
  // BodySurfaceSectionFrame 承载 itemRef(scroll/reveal 语义)与可见性,与 legacy 同一实现。
  return (
    <BodySurfaceSectionFrame
      className={visibilityClassName(section.visibility)}
      itemRef={section.itemRef}
      revealKey={section.key}
      visibility={section.visibility}
    >
      {hasHeader ? (
        <Card className="border-slate-200 shadow-sm" extra={extra} title={titleNode}>{content}</Card>
      ) : (
        content
      )}
    </BodySurfaceSectionFrame>
  );
}

export function AntdSectionStack({
  sections,
  layout = "stack",
  gridColumns = 2,
}: {
  sections?: BodySurfaceSectionSpec[];
  layout?: "stack" | "grid";
  gridColumns?: BodySurfaceSectionGridColumns;
}) {
  if (!sections?.length) return null;
  const className = layout === "grid"
    ? `grid items-stretch gap-4 ${gridColumns === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`
    : "grid gap-4";
  return (
    <BodySurfaceRevealProvider>
      <div className={className}>
        {sections.map((section) => <AntdBodySection key={section.key} section={section} />)}
      </div>
    </BodySurfaceRevealProvider>
  );
}

export function AntdComposedBody({ body }: { body: BodySurfaceComposedSectionProps }) {
  // 移动端 drilldown(栏目列表→详情→返回)依赖 legacy MobileSectionDrilldown 的导航与 reveal 上下文,
  // 不可静默退化为 stack,整体 fail-closed 委托 legacy BodySurface。
  if (body.mobilePresentation === "drilldown") return <BodySurface {...body} />;
  const blocks = [
    renderAntdMessage(body.message),
    renderAntdStatus(body.status),
    body.status ? null : body.list ? (
      <BodySurfaceList key="list" list={body.list} renderSections={(sections) => <AntdSectionStack sections={sections} />} />
    ) : null,
    body.status ? null : renderModuleGrid(body.moduleGrid),
    !body.status && body.sections?.length ? (
      <AntdSectionStack
        key="sections"
        sections={body.sections}
        layout={body.layout}
        gridColumns={body.gridColumns}
      />
    ) : null,
  ].filter(Boolean);
  return (
    <>
      {blocks.length ? blocks : renderAntdEmpty(body.empty)}
      <AntdBodyModals modals={body.modals} />
    </>
  );
}
