"use client";

import { workspacePath } from "@workspace/core/routing";
import { matchText } from "@workspace/core/search";
import { DataSurface, NavigationSurface, PageSurface } from "@workspace/core/ui";
import type {
  QcTemplateDetail,
  QcTemplateFeedbackState,
} from "@workspace/production/server/qc";
import { useMemo, useState, type ReactNode } from "react";
import TemplateFeedbackModal from "./template-workbench/TemplateFeedbackModal";
import TemplatePreviewModal from "./template-workbench/TemplatePreviewModal";
import {
  createQcTemplateWorkbenchViewModel,
  previewKey,
  type QcTemplateWorkbenchRow,
  type QcTemplateWorkbenchRowAction,
  type QcTemplateWorkbenchSection,
  type QcTemplateWorkbenchViewModel,
} from "./template-workbench/qc-template-workbench-view-model";
import {
  type FeedbackTarget,
  type WorkbenchSelection,
} from "./template-workbench/types";
import { productionQcPageHeader, type ProductionQcPageChromeSpec } from "./ProductionQcPageChrome";

interface Props {
  templates: QcTemplateDetail[];
  feedbackStates: Record<string, QcTemplateFeedbackState>;
  pageChrome?: ProductionQcPageChromeSpec;
}

interface SectionView extends QcTemplateWorkbenchSection {
  expandedView: boolean;
  rows: QcTemplateWorkbenchRow[];
}

const indicatorClassNames = {
  danger: "bg-red-600",
  success: "bg-emerald-700",
} as const;

function textMatches(values: Array<ReactNode | string | number | null | undefined>, keyword: string) {
  return values.some((value) => matchText(String(value ?? ""), keyword));
}

function toggleText(section: SectionView) {
  if (section.toggleLabel) return section.toggleLabel;
  if (typeof section.toggleCount === "number" && section.toggleUnit) {
    return `${section.expandedView ? "收起" : "展开"} · ${section.toggleCount} ${section.toggleUnit}`;
  }
  return section.expandedView ? "收起" : "展开";
}

function actionLabel(action: QcTemplateWorkbenchRowAction) {
  return (
    <>
      {action.indicator ? <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${indicatorClassNames[action.indicator]}`} /> : null}
      {action.loading ? "加载中" : action.label}
    </>
  );
}

function WorkbenchSurface({
  viewModel,
  pageChrome,
}: {
  viewModel: QcTemplateWorkbenchViewModel;
  pageChrome?: ProductionQcPageChromeSpec;
}) {
  const [selectorKey, setSelectorKey] = useState(viewModel.defaultSelectorKey ?? viewModel.selectorItems[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const keyword = query.trim();

  const sections = useMemo<SectionView[]>(() => viewModel.sections
    .filter((section) => selectorKey === "all" || !section.selectorKey || section.selectorKey === selectorKey)
    .map((section) => {
      const expandedView = section.expanded ?? expandedOverrides[section.key] ?? section.defaultExpanded ?? true;
      const rows = section.rows.filter((row) => !keyword || textMatches(row.searchText ?? [row.title, row.description, row.badge], keyword));
      return {
        ...section,
        expandedView,
        rows,
      };
    })
    .filter((section) => section.rows.length > 0 || !keyword || textMatches(section.searchText ?? [section.title, section.subtitle], keyword)), [expandedOverrides, keyword, selectorKey, viewModel.sections]);

  function toggleSection(section: SectionView) {
    section.onToggle?.();
    if (!section.onToggle && typeof section.expanded !== "boolean") {
      setExpandedOverrides((current) => ({ ...current, [section.key]: !section.expandedView }));
    }
  }

  return (
    <PageSurface
      kind="list"
      header={pageChrome ? productionQcPageHeader(pageChrome) : undefined}
      toolbar={!viewModel.hideToolbar
        ? {
            items: [
              {
                kind: "search",
                key: "search",
                section: "filter",
                value: query,
                onChange: setQuery,
                placeholder: viewModel.searchPlaceholder ?? "搜索模板、阶段、项目",
                className: "min-w-[260px] flex-1",
              },
              ...(viewModel.toolbarMeta ? [{
                kind: "text" as const,
                key: "meta",
                section: "meta" as const,
                content: viewModel.toolbarMeta,
              }] : []),
            ],
          }
        : undefined}
      body={{
        content: (
          <section className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0 max-lg:order-last">
          <NavigationSurface
            kind="selector"
            selector={{
              title: viewModel.selectorTitle,
              bodyClassName: "p-3",
              contentClassName: "space-y-2",
              items: viewModel.selectorItems,
              selectedId: selectorKey,
              onSelect: (item) => setSelectorKey(item.key),
              getKey: (item) => item.key,
              renderItem: (item) => ({
                title: item.title,
                subtitle: item.subtitle,
                trailing: item.trailing,
              }),
            }}
          />
        </div>
        <div className="min-w-0 space-y-5">
          {sections.map((section) => {
            const title = (
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate">{section.title}</span>
                {section.status ? (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${section.status.tone === "red" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                    {section.status.label}
                  </span>
                ) : null}
              </span>
            );
            const actions = section.collapsible || section.onToggle ? [{
              key: "toggle",
              label: toggleText(section),
              variant: "secondary" as const,
              size: "sm" as const,
              className: "px-3 py-1.5 text-sm",
              onClick: () => toggleSection(section),
            }] : undefined;

            if (!section.expandedView) {
              return (
                <DataSurface
                  key={section.key}
                  kind="records"
                  framed
                  title={title}
                  subtitle={section.subtitle}
                  actions={actions}
                  records={[]}
                  empty="已收起。"
                />
              );
            }

            return (
              <DataSurface<QcTemplateWorkbenchRow>
                key={section.key}
                kind="table"
                framed
                title={title}
                subtitle={section.subtitle}
                actions={actions}
                rows={section.rows}
                columns={[
                  {
                    key: "title",
                    label: "项目",
                    required: true,
                    cell: (row) => (
                      <div className={`flex min-w-0 items-start gap-3 ${row.inset ? "pl-5" : ""}`}>
                        <span className="min-w-9 rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">{row.badge}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{row.title}</span>
                          {row.description ? <span className="mt-1 block truncate text-xs text-slate-500">{row.description}</span> : null}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    label: "操作",
                    required: true,
                    cell: (row) => ({
                      kind: "actions",
                      align: "right",
                      actions: (row.actions ?? []).map((action, index) => ({
                        key: `${row.key}:action:${index}`,
                        label: actionLabel(action),
                        variant: action.variant,
                        disabled: action.disabled || action.loading,
                        size: "sm",
                        className: "h-9 px-3 text-xs",
                        onClick: action.onClick,
                      })),
                    }),
                  },
                ]}
                visibleColumns={["title", "actions"]}
                rowKey={(row) => row.key}
                emptyText="暂无项目。"
              />
            );
          })}
          {sections.length === 0 ? <DataSurface kind="records" records={[]} empty={viewModel.emptyText ?? "没有匹配的模板。"} /> : null}
        </div>
            </div>
          </section>
        ),
      }}
    />
  );
}

export default function QcTemplateWorkbench({ templates, feedbackStates, pageChrome }: Props) {
  const [preview, setPreview] = useState<WorkbenchSelection | null>(null);
  const [previewLoading, setPreviewLoading] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [knownFeedbackStates, setKnownFeedbackStates] = useState(feedbackStates);
  const [detailCache] = useState(() => new Map<string, QcTemplateDetail>());

  function markFeedbackKeysOpen(keys: string[]) {
    setKnownFeedbackStates((current) => {
      const next = { ...current };
      for (const key of keys) {
        if (!next[key]) next[key] = "open";
      }
      return next;
    });
  }

  async function loadTemplateDetail(templateId: string) {
    const cached = detailCache.get(templateId);
    if (cached) return cached;
    const response = await fetch(workspacePath(`/api/modules/production/qc-templates/${encodeURIComponent(templateId)}`));
    if (!response.ok) throw new Error("模板详情加载失败");
    const body = await response.json() as { data?: QcTemplateDetail };
    if (!body.data) throw new Error("模板详情为空");
    detailCache.set(templateId, body.data);
    return body.data;
  }

  async function openPreview(selection: WorkbenchSelection) {
    const loadingKey = previewKey(selection);
    setPreviewLoading(loadingKey);
    setPreviewError("");
    try {
      const detail = await loadTemplateDetail(selection.template.id);
      const stage = detail.stages.find((item) => item.key === selection.stage.key) || detail.stages[selection.stageIndex];
      const test = selection.test && stage?.tests.find((item) => item.englishName === selection.test?.englishName);
      if (!stage) throw new Error("模板阶段不存在");
      setPreview({ template: detail, stage, stageIndex: selection.stageIndex, kind: selection.kind, test });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "模板详情加载失败");
    } finally {
      setPreviewLoading("");
    }
  }

  const viewModel = createQcTemplateWorkbenchViewModel({
    templates,
    feedbackStates: knownFeedbackStates,
    previewLoading,
    toolbarMeta: previewError ? <span className="text-red-600">{previewError}</span> : undefined,
    onPreview: (selection) => { void openPreview(selection); },
    onFeedback: setFeedback,
  });

  return (
    <section>
      <WorkbenchSurface viewModel={viewModel} pageChrome={pageChrome} />
      <TemplatePreviewModal selection={preview} onClose={() => setPreview(null)} onSaved={markFeedbackKeysOpen} />
      <TemplateFeedbackModal target={feedback} onClose={() => setFeedback(null)} onSaved={setKnownFeedbackStates} />
    </section>
  );
}
