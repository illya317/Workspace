"use client";

import DataSurface from "./DataSurface";
import DocumentSurface, { type DocumentSurfaceProps } from "./DocumentSurface";
import FormSurface from "./FormSurface";
import NavigationSurface, { type NavigationSurfaceProps } from "./NavigationSurface";
import type { ReactNode, Ref } from "react";
import type { DataSurfaceProps, DataSurfaceLooseRow } from "./DataSurface.types";
import type { FormSurfaceProps, FormSurfaceLooseItem } from "./FormSurface.types";
import SelectorSurface, { type SelectorSurfaceProps } from "./SelectorSurface";
import VisualizationSurface, { type VisualizationSurfaceProps } from "./VisualizationSurface";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import DetailModal from "./internal/common/DetailModal";
import type { ModuleCardColor } from "./internal/common/Card";
import { renderBodyEmpty, renderBodyMessage, renderBodyStatus, renderModuleGrid, renderSectionBadges } from "./internal/body/BodySurfaceBlocks";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import TabBar from "./internal/common/TabBar";
import { joinClassNames } from "./internal/common/card-utils";
import { renderCommands } from "./internal/page/PageSurface.commands";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";

export { renderBodyEmpty } from "./internal/body/BodySurfaceBlocks";

export type BodySurfaceKind = "data" | "document" | "form" | "navigation" | "selector" | "section" | "visualization";

export type BodySurfaceActionSize = "sm" | "md" | "lg";
export type BodySurfaceSectionChrome = "card" | "divider" | "plain";
export type BodySurfaceSectionLayout = "stack" | "grid" | "split";
export type BodySurfaceSectionGridColumns = 2 | 3;

export interface BodySurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: BodySurfaceActionSize;
  presentation?: "auto" | "text" | "icon";
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

export interface BodySurfaceStatusSpec {
  kind: "empty" | "loading" | "error";
  content: ReactNode;
  compact?: boolean;
}

export interface BodySurfaceListItemSpec {
  key: string | number;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  badges?: BodySurfaceBadgeSpec[];
  actions?: BodySurfaceCommandSpec[];
  sections?: BodySurfaceSectionSpec[];
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
  unread?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export interface BodySurfaceListSpec {
  items: BodySurfaceListItemSpec[];
  empty?: BodySurfaceEmptySpec;
  footerAction?: BodySurfaceCommandSpec;
  density?: "normal" | "compact";
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
  status?: BodySurfaceStatusSpec;
  empty?: BodySurfaceEmptySpec;
  list?: BodySurfaceListSpec;
  moduleGrid?: BodySurfaceModuleGridSpec;
  modals?: BodySurfaceModalSpec[];
}

export type BodySurfaceComposedSectionProps = BodySurfaceSectionCommonProps & {
  layout?: "stack" | "grid";
  gridColumns?: BodySurfaceSectionGridColumns;
  sections?: BodySurfaceSectionSpec[];
  sectioning?: BodySurfaceSectioningSpec;
};

export type BodySurfaceSplitSectionProps = BodySurfaceSectionCommonProps & {
  layout: "split";
  left: BodySurfaceProps;
  drawerLeft?: BodySurfaceProps;
  right: BodySurfaceProps;
  toolbarItems?: SurfaceToolbarItems;
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
  chrome?: BodySurfaceSectionChrome;
  framed?: boolean;
  itemRef?: Ref<HTMLDivElement>;
  body: BodySurfaceProps;
}

export type BodySurfaceDataProps<T = DataSurfaceLooseRow> = { kind: "data"; data: DataSurfaceProps<T> };
export type BodySurfaceDocumentProps = { kind: "document"; document: DocumentSurfaceProps };
export type BodySurfaceFormProps<T = FormSurfaceLooseItem> = { kind: "form"; form: FormSurfaceProps<T> };
export type BodySurfaceNavigationProps = { kind: "navigation"; navigation: NavigationSurfaceProps };
export type BodySurfaceSelectorProps = { kind: "selector"; selector: SelectorSurfaceProps };
export type BodySurfaceVisualizationProps = { kind: "visualization"; visualization: VisualizationSurfaceProps };

export type BodySurfaceProps<TData = DataSurfaceLooseRow, TForm = FormSurfaceLooseItem> =
  | BodySurfaceDataProps<TData>
  | BodySurfaceDocumentProps
  | BodySurfaceFormProps<TForm>
  | BodySurfaceNavigationProps
  | BodySurfaceSelectorProps
  | BodySurfaceSectionProps
  | BodySurfaceVisualizationProps;

const MODAL_MAX_WIDTH_BY_SIZE = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

function listItemClassName(item: BodySurfaceListItemSpec) {
  const toneClass =
    item.tone === "success"
      ? "bg-emerald-50/60"
      : item.tone === "warning"
        ? "bg-amber-50/70"
        : item.tone === "danger"
          ? "bg-rose-50/70"
          : item.tone === "info"
            ? "bg-sky-50/60"
            : item.tone === "muted"
              ? "bg-slate-50"
              : "bg-white";
  return joinClassNames("px-4 py-3 transition", item.onClick ? "hover:bg-emerald-50/40" : "", toneClass);
}

function renderBodyList(list?: BodySurfaceListSpec) {
  if (!list) return null;
  if (list.items.length === 0) return renderBodyEmpty(list.empty ?? { content: "暂无数据", compact: true });
  const titleClassName = (item: BodySurfaceListItemSpec) => joinClassNames(
    "min-w-0 text-left text-sm",
    item.unread ? "font-semibold text-slate-950" : "font-medium text-slate-700",
    item.onClick ? "hover:text-emerald-700" : "",
  );
  return (
    <div key="list" className="overflow-hidden rounded-md border border-slate-100 bg-white">
      <div className="divide-y divide-slate-100">
        {list.items.map((item) => (
          <div key={item.key} className={listItemClassName(item)} onMouseEnter={item.onMouseEnter}>
            <div className="flex items-start justify-between gap-3">
              {item.leading ? <div className="shrink-0">{item.leading}</div> : null}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  {item.unread ? <span aria-label="未读" className="size-1.5 shrink-0 rounded-full bg-sky-500" /> : null}
                  {item.onClick ? (
                    <button type="button" className={titleClassName(item)} onClick={item.onClick}>
                      {item.title}
                    </button>
                  ) : (
                    <div className={titleClassName(item)}>{item.title}</div>
                  )}
                  {renderSectionBadges(item.badges)}
                </div>
                {item.description ? <div className="mt-1 text-xs leading-5 text-slate-600">{item.description}</div> : null}
                {item.meta ? <div className="mt-2 min-w-0 text-left text-[11px] text-slate-400">{item.meta}</div> : null}
                {item.sections?.length ? (
                  <div className="mt-3">
                    <BodySurfaceSectionStack sections={item.sections} />
                  </div>
                ) : null}
              </div>
              {item.trailing ? <div className="shrink-0">{item.trailing}</div> : null}
              {item.actions?.length ? <div className="shrink-0">{renderCommands(item.actions)}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {list.footerAction ? (
        <div className="border-t border-slate-100 px-4 py-3 text-center">
          {renderCommands([{ ...list.footerAction, size: list.footerAction.size ?? "sm" }])}
        </div>
      ) : null}
    </div>
  );
}

const sectionChrome = (section: BodySurfaceSectionSpec): BodySurfaceSectionChrome => section.chrome ?? (section.framed === false ? "plain" : "card");

function renderSectionHeader(section: BodySurfaceSectionSpec, chrome: BodySurfaceSectionChrome = sectionChrome(section)) {
  const header = section.header;
  if (!header?.title && !header?.subtitle && !header?.badges?.length && !header?.toolbarItems?.length && !header?.actions?.length) return null;
  const actions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {header.toolbarItems?.length ? <Toolbar items={header.toolbarItems} /> : null}
      {renderCommands(header.actions)}
    </div>
  );
  return (
    <div className={joinClassNames("flex items-start justify-between gap-3", chrome === "divider" ? "border-b border-slate-200 pb-3" : "")}>
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

function renderBodySection(section: BodySurfaceSectionSpec, stretch = false) {
  const stretchClassName = stretch ? "h-full" : "";
  const chrome = sectionChrome(section);
  const sectionClassName = joinClassNames(chrome === "card" ? "space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm" : "space-y-4", stretchClassName);
  const content = <section className={sectionClassName}>{renderSectionHeader(section, chrome)}<BodySurface {...section.body} /></section>;
  if (section.itemRef) return <div key={section.key} ref={section.itemRef} className={stretchClassName}>{content}</div>;
  return <div key={section.key} className={stretchClassName}>{content}</div>;
}

function BodySurfaceSectionStack({ sections, sectioning, layout = "stack", gridColumns = 2 }: {
  sections?: BodySurfaceSectionSpec[];
  sectioning?: BodySurfaceSectioningSpec;
  layout?: "stack" | "grid";
  gridColumns?: BodySurfaceSectionGridColumns;
}) {
  if (!sections?.length) return null;
  if (sectioning?.kind === "tabs") {
    const active = activeBodySection(sections, sectioning.active);
    return (
      <div className="space-y-5">
        <TabBar
          kind="page"
          variant="large"
          className="mb-0"
          tabs={sections.map((section) => ({ key: section.key, label: section.label ?? section.key }))}
          active={active?.key ?? sectioning.active}
          onChange={(key) => sectioning.onChange?.(key)}
        />
        {active ? renderBodySection(active) : null}
      </div>
    );
  }
  if (layout === "grid") {
    const gridClassName = gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return <div className={`grid items-stretch gap-4 ${gridClassName}`}>{sections.map((section) => renderBodySection(section, true))}</div>;
  }
  return <div className="space-y-5">{sections.map((section) => renderBodySection(section))}</div>;
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
  const sideItems: ToolbarItem[] = props.showSideControls === false ? [] : [
    { kind: "panel-toggle", key: "mobile-side-toggle", icon: "panel-open", label: `显示${props.sideLabel}`, onClick: () => props.onDrawerOpenChange(true), visibility: "mobile" },
    { kind: "panel-toggle", key: "desktop-side-toggle", icon: props.sideOpen ? "panel-open" : "panel-close", label: `${props.sideOpen ? "隐藏" : "显示"}${props.sideLabel}`, onClick: () => props.onSideOpenChange(!props.sideOpen), variant: props.sideOpen ? "primary" : "secondary", visibility: "desktop" },
  ];
  const items = [...sideItems, ...(props.toolbarItems ?? [])];
  if (!items.length) return null;
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
    renderBodyStatus(props.status),
    props.status ? null : renderBodyList(props.list),
    props.status ? null : renderModuleGrid(props.moduleGrid),
    !props.status && props.sections?.length ? (
      <BodySurfaceSectionStack
        key="sections"
        sections={props.sections}
        sectioning={props.sectioning}
        layout={props.layout}
        gridColumns={props.gridColumns}
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
  if (props.kind === "navigation") return <NavigationSurface {...props.navigation} />;
  if (props.kind === "selector") return <SelectorSurface {...props.selector} />;
  if (props.kind === "section") return renderSectionSurface(props);
  return <VisualizationSurface {...props.visualization} />;
}
