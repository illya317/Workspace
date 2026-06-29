"use client";

import DataSurface from "./DataSurface";
import DocumentSurface, { type DocumentSurfaceProps } from "./DocumentSurface";
import FormSurface from "./FormSurface";
import BlockSurface, { type BlockSurfaceProps } from "./BlockSurface";
import NavigationRenderer, { type NavigationRendererProps } from "./NavigationRenderer";
import type { ReactNode, Ref } from "react";
import type { DataSurfaceProps, DataSurfaceLooseRow } from "./DataSurface.types";
import type { FormSurfaceProps, FormSurfaceLooseItem } from "./FormSurface.types";
import MetricsSurface, { type MetricsSurfaceProps } from "./MetricsSurface";
import RecordSurface, { type RecordSurfaceProps } from "./RecordSurface";
import SelectorSurface, { type SelectorSurfaceProps } from "./SelectorSurface";
import VisualizationSurface, { type VisualizationSurfaceProps } from "./VisualizationSurface";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import DetailModal from "./internal/common/DetailModal";
import { EmptyStateCard, ModuleCard, type ModuleCardColor } from "./internal/common/Card";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import TabBar from "./internal/common/TabBar";
import { joinClassNames } from "./internal/common/card-utils";
import { renderCommands } from "./internal/page/PageSurface.commands";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";

export type BodySurfaceKind = "data" | "document" | "form" | "metrics" | "navigation" | "record" | "selector" | "section" | "visualization";

export type BodySurfaceActionSize = "sm" | "md" | "lg";
export type BodySurfaceSectionLayout = "stack" | "grid" | "split";

export interface BodySurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: BodySurfaceActionSize;
  truncate?: boolean;
}

export interface BodySurfaceEmptySpec {
  presentation?: "card" | "plain";
  content: ReactNode;
  compact?: boolean;
}

export interface BodySurfaceMessageSpec {
  content: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
}

export interface BodySurfaceModuleGridItemSpec {
  key: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

export interface BodySurfaceModuleGridSpec {
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  items: BodySurfaceModuleGridItemSpec[];
}

export interface BodySurfaceModalSpec {
  key: string;
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  sections: BodySurfaceSectionSpec[];
}

export interface BodySurfaceBadgeSpec {
  key: string;
  label: ReactNode;
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
}

export interface BodySurfaceSectionHeaderSpec {
  title?: ReactNode;
  subtitle?: ReactNode;
  badges?: BodySurfaceBadgeSpec[];
  toolbarItems?: SurfaceToolbarItems;
  actions?: BodySurfaceCommandSpec[];
}

interface BodySurfaceSectionCommonProps {
  kind: "section";
  title?: ReactNode;
  description?: ReactNode;
  commands?: BodySurfaceCommandSpec[];
  message?: BodySurfaceMessageSpec;
  empty?: BodySurfaceEmptySpec;
  moduleGrid?: BodySurfaceModuleGridSpec;
  modals?: BodySurfaceModalSpec[];
}

export type BodySurfaceComposedSectionProps = BodySurfaceSectionCommonProps & {
  layout?: "stack" | "grid";
  surface?: BlockSurfaceProps;
  sections?: BodySurfaceSectionSpec[];
  sectioning?: BodySurfaceSectioningSpec;
};

export type BodySurfaceSplitSectionProps = BodySurfaceSectionCommonProps & {
  layout: "split";
  left: BodySurfaceProps;
  drawerLeft?: BodySurfaceProps;
  right: BodySurfaceProps;
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  showSideControls?: boolean;
  splitRatio?: readonly [number, number];
};

export type BodySurfaceSectionProps = BodySurfaceComposedSectionProps | BodySurfaceSplitSectionProps;

export type BodySurfaceSectioningSpec =
  | { kind: "none" }
  | { kind: "tabs"; active: string; onChange?: (key: string) => void };

export interface BodySurfaceSectionSpec {
  key: string;
  label?: ReactNode;
  header?: BodySurfaceSectionHeaderSpec;
  framed?: boolean;
  itemRef?: Ref<HTMLDivElement>;
  body: BodySurfaceProps;
}

export type BodySurfaceDataProps<T = DataSurfaceLooseRow> = { kind: "data"; data: DataSurfaceProps<T> };
export type BodySurfaceDocumentProps = { kind: "document"; document: DocumentSurfaceProps };
export type BodySurfaceFormProps<T = FormSurfaceLooseItem> = { kind: "form"; form: FormSurfaceProps<T> };
export type BodySurfaceMetricsProps = { kind: "metrics"; metrics: MetricsSurfaceProps };
export type BodySurfaceNavigationProps = { kind: "navigation"; navigation: NavigationRendererProps };
export type BodySurfaceRecordProps = { kind: "record"; record: RecordSurfaceProps };
export type BodySurfaceSelectorProps = { kind: "selector"; selector: SelectorSurfaceProps };
export type BodySurfaceVisualizationProps = { kind: "visualization"; visualization: VisualizationSurfaceProps };

export type BodySurfaceProps<TData = DataSurfaceLooseRow, TForm = FormSurfaceLooseItem> =
  | BodySurfaceDataProps<TData>
  | BodySurfaceDocumentProps
  | BodySurfaceFormProps<TForm>
  | BodySurfaceMetricsProps
  | BodySurfaceNavigationProps
  | BodySurfaceRecordProps
  | BodySurfaceSelectorProps
  | BodySurfaceSectionProps
  | BodySurfaceVisualizationProps;

const MODAL_MAX_WIDTH_BY_SIZE = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

export function renderBodyEmpty(empty?: BodySurfaceEmptySpec) {
  if (!empty) return null;
  if (empty.presentation === "plain") {
    return <div className="text-sm text-slate-500">{empty.content}</div>;
  }
  return <EmptyStateCard compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function renderBodyMessage(message?: BodySurfaceMessageSpec) {
  if (!message) return null;
  const toneClass =
    message.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : message.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : message.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : message.tone === "muted"
            ? "border-slate-100 bg-slate-50 text-slate-500"
            : "border-slate-200 bg-white text-slate-600";
  return <div className={joinClassNames("rounded-md border px-3 py-2 text-sm", toneClass)}>{message.content}</div>;
}

function renderModuleGrid(moduleGrid?: BodySurfaceModuleGridSpec) {
  if (!moduleGrid) return null;
  return (
    <div className={joinClassNames(
      "flex w-full flex-col items-center",
      moduleGrid.fullScreen ? "min-h-screen justify-center" : "",
      moduleGrid.centered ? "justify-center" : "",
    )}>
      {(moduleGrid.leading || moduleGrid.title || moduleGrid.summary) && (
        <div className="mb-8 flex flex-col items-center">
          {moduleGrid.leading}
          {moduleGrid.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{moduleGrid.title}</h1> : null}
          {moduleGrid.summary ? <p className="mt-1 text-center text-sm text-gray-500">{moduleGrid.summary}</p> : null}
        </div>
      )}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleGrid.items.map((item) => {
          const { key, ...props } = item;
          return <ModuleCard key={key} {...props} />;
        })}
      </div>
      {moduleGrid.afterGrid ? <div className="mt-8 w-full max-w-4xl">{moduleGrid.afterGrid}</div> : null}
    </div>
  );
}

function badgeClassName(tone: BodySurfaceBadgeSpec["tone"] = "default") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  if (tone === "danger") return "bg-rose-50 text-rose-600";
  if (tone === "info") return "bg-sky-50 text-sky-700";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-700";
}

function renderSectionBadges(badges?: BodySurfaceBadgeSpec[]) {
  if (!badges?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span key={badge.key} className={`rounded px-2 py-1 text-xs font-medium ${badgeClassName(badge.tone)}`}>{badge.label}</span>
      ))}
    </div>
  );
}

function renderSectionHeader(section: BodySurfaceSectionSpec) {
  const header = section.header;
  if (!header?.title && !header?.subtitle && !header?.badges?.length && !header?.toolbarItems?.length && !header?.actions?.length) return null;
  const actions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {header.toolbarItems?.length ? <Toolbar items={header.toolbarItems} /> : null}
      {renderCommands(header.actions)}
    </div>
  );
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        {(header.title || header.badges?.length) && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {header.title ? <h3 className="truncate text-base font-semibold text-slate-900">{header.title}</h3> : null}
            {renderSectionBadges(header.badges)}
          </div>
        )}
        {header.subtitle ? <p className="text-sm leading-5 text-slate-500">{header.subtitle}</p> : null}
      </div>
      {header.toolbarItems?.length || header.actions?.length ? actions : null}
    </div>
  );
}

function activeBodySection(sections: BodySurfaceSectionSpec[], active: string) {
  return sections.find((section) => section.key === active) ?? sections[0] ?? null;
}

function renderBodyModals(modals?: BodySurfaceModalSpec[]) {
  if (!modals?.length) return null;
  return modals.map((modal) => (
    <DetailModal
      key={modal.key}
      open={modal.open}
      title={modal.title}
      onClose={modal.onClose}
      maxWidth={modal.size ? MODAL_MAX_WIDTH_BY_SIZE[modal.size] : undefined}
    >
      <BodySurfaceSectionStack sections={modal.sections} />
    </DetailModal>
  ));
}

function renderBodySection(section: BodySurfaceSectionSpec) {
  const content = (
    <section className={section.framed === false ? "space-y-4" : "space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm"}>
      {renderSectionHeader(section)}
      <BodySurface {...section.body} />
    </section>
  );
  return section.itemRef ? <div key={section.key} ref={section.itemRef}>{content}</div> : <div key={section.key}>{content}</div>;
}

function BodySurfaceSectionStack({
  sections,
  sectioning,
  layout = "stack",
}: {
  sections?: BodySurfaceSectionSpec[];
  sectioning?: BodySurfaceSectioningSpec;
  layout?: "stack" | "grid";
}) {
  if (!sections?.length) return null;
  if (sectioning?.kind === "tabs") {
    const active = activeBodySection(sections, sectioning.active);
    return (
      <div className="space-y-5">
        <TabBar
          kind="table"
          variant="lineLarge"
          className="border-b-0 pb-0"
          tabs={sections.map((section) => ({ key: section.key, label: section.label ?? section.key }))}
          active={active?.key ?? sectioning.active}
          onChange={(key) => sectioning.onChange?.(key)}
        />
        {active ? renderBodySection(active) : null}
      </div>
    );
  }
  if (layout === "grid") {
    return <div className="grid gap-4 lg:grid-cols-2">{sections.map(renderBodySection)}</div>;
  }
  return <div className="space-y-5">{sections.map(renderBodySection)}</div>;
}

function renderBodyTitle(props: BodySurfaceSectionProps) {
  if (!props.title && !props.description) return null;
  return (
    <div className="space-y-1">
      {props.title ? <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2> : null}
      {props.description ? <p className="text-sm text-slate-500">{props.description}</p> : null}
    </div>
  );
}

function renderSplitSide(props: BodySurfaceSplitSectionProps, mode: SplitWorkspaceMode) {
  const body = mode === "drawer" ? props.drawerLeft ?? props.left : props.left;
  return <BodySurface {...body} />;
}

function renderSplitSideControls(props: BodySurfaceSplitSectionProps) {
  if (props.showSideControls === false) return null;
  const items: ToolbarItem[] = [
    {
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: `显示${props.sideLabel}`,
      onClick: () => props.onDrawerOpenChange(true),
      visibility: "mobile",
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: props.sideOpen ? "panel-open" : "panel-close",
      label: `${props.sideOpen ? "隐藏" : "显示"}${props.sideLabel}`,
      onClick: () => props.onSideOpenChange(!props.sideOpen),
      variant: props.sideOpen ? "primary" : "secondary",
      visibility: "desktop",
    },
  ];
  return <Toolbar items={items} />;
}

function renderSectionContent(props: BodySurfaceSectionProps) {
  if (props.layout === "split") {
    return (
      <div className="space-y-3">
        {renderSplitSideControls(props)}
        <SplitWorkspace
          sideOpen={props.sideOpen}
          drawerOpen={props.drawerOpen}
          onDrawerOpenChange={props.onDrawerOpenChange}
          renderSide={(mode) => renderSplitSide(props, mode)}
          splitRatio={props.splitRatio}
        >
          <BodySurface {...props.right} />
        </SplitWorkspace>
      </div>
    );
  }

  const blocks = [
    renderBodyMessage(props.message),
    renderModuleGrid(props.moduleGrid),
    props.surface ? <BlockSurface key="surface" {...props.surface} /> : null,
    props.sections?.length ? (
      <BodySurfaceSectionStack
        key="sections"
        sections={props.sections}
        sectioning={props.sectioning}
        layout={props.layout}
      />
    ) : null,
  ].filter(Boolean);

  if (!blocks.length) return renderBodyEmpty(props.empty);
  return blocks;
}

function renderSectionSurface(props: BodySurfaceSectionProps) {
  return (
    <div className="space-y-4">
      {renderCommands(props.commands)}
      {renderBodyTitle(props)}
      {renderSectionContent(props)}
      {renderBodyModals(props.modals)}
    </div>
  );
}

export default function BodySurface(props: BodySurfaceProps) {
  if (props.kind === "data") return <DataSurface {...props.data} />;
  if (props.kind === "document") return <DocumentSurface {...props.document} />;
  if (props.kind === "form") return <FormSurface {...props.form} />;
  if (props.kind === "metrics") return <MetricsSurface {...props.metrics} />;
  if (props.kind === "navigation") return <NavigationRenderer {...props.navigation} />;
  if (props.kind === "record") return <RecordSurface {...props.record} />;
  if (props.kind === "selector") return <SelectorSurface {...props.selector} />;
  if (props.kind === "section") return renderSectionSurface(props);
  return <VisualizationSurface {...props.visualization} />;
}
