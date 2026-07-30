"use client";

import { useState } from "react";
import { textOverflowTitle } from "./internal/common/text-overflow";
import DataSurface from "./DataSurface";
import CreateSurface, { type CreateSurfaceSurfaceProps } from "./CreateSurface";
import DocumentSurface from "./DocumentSurface";
import FormSurface from "./FormSurface";
import NavigationSurface from "./NavigationSurface";
import SelectorSurface from "./SelectorSurface";
import VisualizationSurface from "./VisualizationSurface";
import DetailModal from "./internal/common/DetailModal";
import { renderBodyEmpty, renderBodyMessage, renderBodyStatus, renderModuleGrid, renderSectionBadges } from "./internal/body/BodySurfaceBlocks";
import { assertNoSurfaceExplanatoryText } from "./internal/body/BodySurfaceGuardParts";
import { BodySurfaceList } from "./internal/body/BodySurfaceList";
import {
  bodySurfaceRootOwnsFrame,
  resolveBodySurfaceSectionChrome,
  resolveBodySurfaceSectionStackPosition,
  type BodySurfaceSectionChrome,
} from "./internal/body/body-surface-section-chrome";
import { BodySurfaceSectionFrame } from "./internal/body/BodySurfaceSectionParts";
import { sectionCardClassName, type BodySectionStackPosition } from "./internal/body/BodySurfaceSectionStack.styles";
import { BodySurfaceRevealProvider } from "./internal/body/BodySurfaceRevealContext";
import { useBodySurfaceSplitRuntime } from "./internal/body/BodySurfaceSplitContext";
import { useBodySurfacePageCreate } from "./internal/body/BodySurfacePageCreateContext";
import { sectionVisibilityClassName } from "./internal/body/body-surface-visibility";
import { CreateSurfaceAnchorProvider, CreateSurfaceAnchorTarget } from "./internal/create/CreateSurfaceAnchorContext";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import { SurfaceFrameBoundary, useSurfaceFrameDepth } from "./internal/common/SurfaceFrameContextParts";
import { joinClassNames } from "./internal/common/card-utils";
import { renderCommands } from "./internal/page/PageSurface.commands";
import { ActionGlyph } from "./internal/action/ActionGlyphs";
import { CreateStartButton } from "./internal/action/CreateActionControls";
import { PAGE_SURFACE_BODY_SECTION_STACK_CLASS } from "./internal/page/PageSurface.spacing";
import type {
  BodySurfaceListSpec,
  BodySurfaceModalSpec,
  BodySurfaceProps,
  BodySurfaceSectionDirectCreateSpec,
  BodySurfaceSectionBodyProps,
  BodySurfaceSectionGridColumns,
  BodySurfaceSectionProps,
  BodySurfaceSectionSpec,
  BodySurfaceSplitMasterFooterSpec,
  BodySurfaceSplitSectionProps,
} from "./BodySurface.types";
import type { PageSurfaceCreateSpec } from "./PageSurface.types";

export type * from "./BodySurface.types";

const MODAL_MAX_WIDTH_BY_SIZE = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" } as const;

function renderBodyList(list?: BodySurfaceListSpec) {
  if (!list) return null;
  return <BodySurfaceList key="list" list={list} renderSections={(sections) => <BodySurfaceSectionStack sections={sections} />} />;
}

type RenderedSectionCreateSpec = CreateSurfaceSurfaceProps | BodySurfaceSectionDirectCreateSpec;

function renderSectionHeader(
  section: BodySurfaceSectionSpec,
  chrome: BodySurfaceSectionChrome,
  create: RenderedSectionCreateSpec | undefined = section.header?.create,
) {
  const header = section.header;
  const disclosure = section.disclosure;
  const title = header?.title ?? section.label;
  if (!title && !header?.badges?.length && !header?.actions?.length && !create) return null;
  const actions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {renderCommands(header?.actions)}
    </div>
  );
  return (
    <div className={joinClassNames("flex items-start justify-between gap-3", chrome === "divider" ? "border-b border-slate-200 pb-3" : "")}>
      <div className="min-w-0 space-y-1.5">
        {(title || header?.badges?.length) && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {disclosure ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                aria-expanded={disclosure.expanded}
                onClick={() => disclosure.onExpandedChange(!disclosure.expanded)}
              >
                <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">
                  {disclosure.expanded ? "▼" : "▶"}
                </span>
                <h3 className="truncate text-base font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</h3>
              </button>
            ) : title ? <h3 className="truncate text-base font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</h3> : null}
            {renderSectionBadges(header?.badges)}
          </div>
        )}
      </div>
      {header?.actions?.length || create ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {create?.presentation === "row"
            ? create.canCreate !== false
              ? <CreateStartButton label={create.title} disabled={create.disabled} onClick={create.onCreate} size="sm" />
              : null
            : create ? <CreateSurface {...create} /> : null}
          {header?.actions?.length ? actions : null}
        </div>
      ) : null}
    </div>
  );
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
      footer={modal.actions?.length || modal.pagination ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {modal.pagination ? <NavigationSurface kind="pagination" pagination={modal.pagination} /> : <span />}
          <div className="ml-auto">{renderCommands(modal.actions)}</div>
        </div>
      ) : undefined}
    >
      <SurfaceFrameBoundary framed><BodySurfaceSectionStack sections={modal.sections} /></SurfaceFrameBoundary>
    </DetailModal>
  ));
}

function renderBodySection(section: BodySurfaceSectionSpec, stretch = false, stackPosition?: BodySectionStackPosition, frameDepth = 0) {
  const stretchClassName = stretch ? "h-full" : "";
  const chrome = resolveBodySurfaceSectionChrome(section, frameDepth);
  const declaredCreate = section.header?.create;
  const renderedCreate: RenderedSectionCreateSpec | undefined = declaredCreate?.presentation === "block"
    ? { ...declaredCreate, anchor: `body-section-create:${declaredCreate.id}` }
    : declaredCreate;
  const createAnchor = renderedCreate?.presentation === "block" ? renderedCreate.anchor ?? null : null;
  const mobileFlushData = chrome === "card"
    && section.body.kind === "data"
    && (section.body.data.kind === "table" || section.body.data.kind === "structured");
  const nestedSection = frameDepth > 0;
  const sectionLayoutClassName = nestedSection
    ? sectionCardClassName(stackPosition, true)
    : chrome === "card"
      ? sectionCardClassName(stackPosition)
      : "space-y-4";
  const sectionClassName = joinClassNames(
    sectionLayoutClassName,
    chrome === "plain" && section.header?.title ? "pt-2" : "",
    mobileFlushData ? "max-sm:!space-y-0 max-sm:!p-0" : "",
    stretchClassName,
  );
  const header = renderSectionHeader(section, chrome, renderedCreate);
  return (
    <BodySurfaceSectionFrame
      key={section.key}
      revealKey={section.key}
      itemRef={section.itemRef}
      className={joinClassNames(stretchClassName, sectionVisibilityClassName(section.visibility))}
      visibility={section.visibility}
    >
      <section className={sectionClassName} data-surface-frame={chrome === "card" ? "primary" : undefined}>
        {mobileFlushData && header ? <div className="px-3 pb-3 pt-3">{header}</div> : header}
        {createAnchor ? <CreateSurfaceAnchorTarget anchor={createAnchor} /> : null}
        {!section.disclosure || section.disclosure.expanded ? (
          <SurfaceFrameBoundary framed={chrome === "card"}>
            <BodySurface {...section.body} />
          </SurfaceFrameBoundary>
        ) : null}
      </section>
    </BodySurfaceSectionFrame>
  );
}

function sectionNavigationTitle(section: BodySurfaceSectionSpec) {
  return section.label ?? section.header?.title ?? null;
}

function MobileSectionDrilldown({ sections }: { sections: BodySurfaceSectionSpec[] }) {
  const frameDepth = useSurfaceFrameDepth();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeIndex = activeKey === null ? -1 : sections.findIndex((section) => section.key === activeKey);
  const activeSection = activeIndex >= 0 ? sections[activeIndex] : null;

  if (!activeSection) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:hidden" data-mobile-section-view="directory">
        {sections.map((section, index) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveKey(section.key)}
            className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left transition first:border-t-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-200"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(sectionNavigationTitle(section))}>{sectionNavigationTitle(section)}</span>
            <span aria-hidden="true" className="shrink-0 text-xl leading-none text-slate-300">›</span>
          </button>
        ))}
      </div>
    );
  }

  const previous = sections[activeIndex - 1];
  const next = sections[activeIndex + 1];
  return (
    <div className="sm:hidden" data-mobile-section-view="detail">
      <div className="mb-3 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <button
          type="button"
          aria-label="返回章节目录"
          title="返回章节目录"
          onClick={() => setActiveKey(null)}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <ActionGlyph kind="back" className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(sectionNavigationTitle(activeSection))}>{sectionNavigationTitle(activeSection)}</span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400">{activeIndex + 1} / {sections.length}</span>
        <button
          type="button"
          aria-label="上一章节"
          title="上一章节"
          disabled={!previous}
          onClick={() => previous && setActiveKey(previous.key)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <ActionGlyph kind="back" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="下一章节"
          title="下一章节"
          disabled={!next}
          onClick={() => next && setActiveKey(next.key)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <span className="rotate-180"><ActionGlyph kind="back" className="size-4" /></span>
        </button>
      </div>
      {renderBodySection(activeSection, false, undefined, frameDepth)}
    </div>
  );
}

function BodySurfaceSectionStack({ sections, layout = "stack", gridColumns = 2, leadingCardSegment = false, mobilePresentation = "stack" }: { sections?: BodySurfaceSectionSpec[]; layout?: "stack" | "grid"; gridColumns?: BodySurfaceSectionGridColumns; leadingCardSegment?: boolean; mobilePresentation?: "stack" | "drilldown" }) {
  const frameDepth = useSurfaceFrameDepth();
  if (!sections?.length) return null;
  if (layout === "grid") {
    const gridClassName = gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><div className={`grid items-stretch gap-4 ${gridClassName}`}>{sections.map((section) => renderBodySection(section, true, undefined, frameDepth))}</div></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>;
  }
  const canDrillDown = mobilePresentation === "drilldown"
    && sections.length > 1
    && sections.every((section) => sectionNavigationTitle(section) !== null);
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider>
      {canDrillDown ? <MobileSectionDrilldown sections={sections} /> : null}
      <div className={`${PAGE_SURFACE_BODY_SECTION_STACK_CLASS} ${canDrillDown ? "max-sm:hidden" : ""}`}>
        {sections.map((section, index) => renderBodySection(section, false, resolveBodySurfaceSectionStackPosition(sections, index, frameDepth, leadingCardSegment), frameDepth))}
      </div>
    </BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>
  );
}

function renderBodyTitle(props: BodySurfaceSectionProps) {
  if (!props.title) return null;
  return (
    <div className="space-y-1">
      {props.title ? <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2> : null}
    </div>
  );
}

function withMobileSplitNavigation(body: BodySurfaceSectionBodyProps, onNavigateToDetail: () => void): BodySurfaceSectionBodyProps;
function withMobileSplitNavigation(body: BodySurfaceProps, onNavigateToDetail: () => void): BodySurfaceProps;
function withMobileSplitNavigation(body: BodySurfaceProps, onNavigateToDetail: () => void): BodySurfaceProps {
  if (body.kind === "selector") {
    const onSelect = body.selector.onSelect as (item: unknown) => void;
    return {
      ...body,
      selector: {
        ...body.selector,
        onSelect: (item: unknown) => {
          onSelect(item);
          onNavigateToDetail();
        },
      },
    } as BodySurfaceProps;
  }
  if (body.kind !== "section" || body.layout === "split" || !body.sections?.length) return body;
  return {
    ...body,
    sections: body.sections.map((section) => ({
      ...section,
      body: withMobileSplitNavigation(section.body, onNavigateToDetail),
    })),
  };
}

function renderSplitMasterFooter(footer?: BodySurfaceSplitMasterFooterSpec) {
  const pagination = footer?.pagination;
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <NavigationSurface kind="pagination" pagination={pagination} />
    </div>
  );
}

function renderSplitSide(props: BodySurfaceSplitSectionProps, mode: SplitWorkspaceMode, onNavigateToDetail?: () => void) {
  const body = mode === "mobile" ? props.master.mobileBody ?? props.master.body : props.master.body;
  const renderedBody = onNavigateToDetail ? withMobileSplitNavigation(body, onNavigateToDetail) : body;
  return (
    <div className="space-y-3">
      <BodySurface {...renderedBody} />
      {renderSplitMasterFooter(props.master.footer)}
    </div>
  );
}

function renderSplitDetail(detail: BodySurfaceProps, pageCreate?: PageSurfaceCreateSpec) {
  if (!pageCreate?.open) return <BodySurface {...detail} />;
  const create = <CreateSurface {...pageCreate} trigger="toolbar" />;
  return pageCreate.presentation === "modal" ? <><BodySurface {...detail} />{create}</> : create;
}

function renderSectionContent(
  props: BodySurfaceSectionProps,
  splitOpen: boolean,
  pageCreate?: PageSurfaceCreateSpec,
) {
  if (props.layout === "split") {
    return (
      <div className="space-y-3">
        <SplitWorkspace
          sideOpen={pageCreate?.open ? true : splitOpen}
          sideLabel={props.master.label}
          renderSide={(mode, onNavigateToDetail) => renderSplitSide(props, mode, onNavigateToDetail)}
          splitRatio={props.desktop?.ratio}
          desktopPresentation={props.desktop?.presentation}
          masterPresentation={props.master.presentation}
          mobileDetailActive={pageCreate?.open ? true : props.mobile?.detailActive}
          onMobileNavigateToList={props.mobile?.onNavigateToList}
        >
          {renderSplitDetail(props.detail, pageCreate)}
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
        layout={props.layout}
        gridColumns={props.gridColumns}
        mobilePresentation={props.mobilePresentation}
      />
    ) : null,
  ].filter(Boolean);

  if (!blocks.length) return renderBodyEmpty(props.empty);
  return blocks;
}

function renderSectionSurface(
  props: BodySurfaceSectionProps,
  splitOpen: boolean,
  pageCreate?: PageSurfaceCreateSpec,
  frameDepth = 0,
) {
  const ownsFrame = bodySurfaceRootOwnsFrame(props, frameDepth);
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><SurfaceFrameBoundary framed={ownsFrame}>
      <section
        className={ownsFrame ? sectionCardClassName() : "space-y-4"}
        data-surface-frame={ownsFrame ? "primary" : undefined}
      >
        {renderCommands(props.commands)}
        {renderBodyTitle(props)}
        {renderSectionContent(props, splitOpen, pageCreate)}
        {renderBodyModals(props.modals)}
      </section>
    </SurfaceFrameBoundary></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>
  );
}

export default function BodySurface(props: BodySurfaceProps) {
  const splitRuntime = useBodySurfaceSplitRuntime();
  const pageCreate = useBodySurfacePageCreate();
  const frameDepth = useSurfaceFrameDepth();
  assertNoSurfaceExplanatoryText(props);
  if (props.kind === "create") {
    return <CreateSurface {...props.create} />;
  }
  if (props.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={props.anchor} />;
  if (props.kind === "data") return <DataSurface {...props.data} />;
  if (props.kind === "document") return <DocumentSurface {...props.document} />;
  if (props.kind === "form") return <FormSurface {...props.form} />;
  if (props.kind === "selector") return <SelectorSurface {...props.selector} />;
  if (props.kind === "section") return renderSectionSurface(props, splitRuntime?.open ?? true, pageCreate, frameDepth);
  return <VisualizationSurface {...props.visualization} />;
}
