"use client";

import { useState } from "react";
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
import { BodySurfaceSectionFrame } from "./internal/body/BodySurfaceSectionParts";
import { sectionCardClassName, sectionStackPosition, type BodySectionStackPosition } from "./internal/body/BodySurfaceSectionStack.styles";
import { BodySurfaceRevealProvider } from "./internal/body/BodySurfaceRevealContext";
import { CreateSurfaceAnchorProvider, CreateSurfaceAnchorTarget } from "./internal/create/CreateSurfaceAnchorContext";
import SplitWorkspace, { type SplitWorkspaceMode } from "./internal/common/SplitWorkspace";
import { joinClassNames } from "./internal/common/card-utils";
import { renderCommands } from "./internal/page/PageSurface.commands";
import { ActionGlyph } from "./internal/action/ActionGlyphs";
import { PAGE_SURFACE_BODY_SECTION_STACK_CLASS } from "./internal/page/PageSurface.spacing";
import type {
  BodySurfaceListSpec,
  BodySurfaceModalSpec,
  BodySurfaceProps,
  BodySurfaceSectionChrome,
  BodySurfaceSectionGridColumns,
  BodySurfaceSectionProps,
  BodySurfaceSectionSpec,
  BodySurfaceSplitSectionProps,
} from "./BodySurface.types";

export type * from "./BodySurface.types";

const MODAL_MAX_WIDTH_BY_SIZE = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" } as const;

function renderBodyList(list?: BodySurfaceListSpec) {
  if (!list) return null;
  return <BodySurfaceList key="list" list={list} renderSections={(sections) => <BodySurfaceSectionStack sections={sections} />} />;
}

const sectionChrome = (section: BodySurfaceSectionSpec): BodySurfaceSectionChrome => section.chrome ?? (section.framed === false ? "plain" : "card");

function renderSectionHeader(
  section: BodySurfaceSectionSpec,
  chrome: BodySurfaceSectionChrome = sectionChrome(section),
  create: CreateSurfaceSurfaceProps | undefined = section.header?.create,
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
                <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
              </button>
            ) : title ? <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3> : null}
            {renderSectionBadges(header?.badges)}
          </div>
        )}
      </div>
      {header?.actions?.length || create ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {create ? <CreateSurface {...create} /> : null}
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
      <BodySurfaceSectionStack sections={modal.sections} />
    </DetailModal>
  ));
}

function renderBodySection(section: BodySurfaceSectionSpec, stretch = false, stackPosition?: BodySectionStackPosition) {
  if (section.body.kind === "create" && section.body.create.presentation === "inline") return null;
  const stretchClassName = stretch ? "h-full" : "";
  const chrome = sectionChrome(section);
  const declaredCreate = section.header?.create;
  const renderedCreate: CreateSurfaceSurfaceProps | undefined = declaredCreate?.presentation === "block"
    ? { ...declaredCreate, anchor: `body-section-create:${declaredCreate.id}` }
    : declaredCreate;
  const createAnchor = renderedCreate?.presentation === "block" ? renderedCreate.anchor ?? null : null;
  const sectionClassName = joinClassNames(
    chrome === "card" ? sectionCardClassName(stackPosition) : "space-y-4",
    chrome === "plain" && section.header?.title ? "pt-2" : "",
    stretchClassName,
  );
  return (
    <BodySurfaceSectionFrame key={section.key} revealKey={section.key} itemRef={section.itemRef} className={stretchClassName}>
      <section className={sectionClassName}>
        {renderSectionHeader(section, chrome, renderedCreate)}
        {createAnchor ? <CreateSurfaceAnchorTarget anchor={createAnchor} /> : null}
        {!section.disclosure || section.disclosure.expanded ? <BodySurface {...section.body} /> : null}
      </section>
    </BodySurfaceSectionFrame>
  );
}

function stackPositionForSection(sections: BodySurfaceSectionSpec[], index: number, leadingCardSegment = false): BodySectionStackPosition | undefined {
  if (sectionChrome(sections[index]) !== "card") return undefined;
  const previousIsCard = (index === 0 && leadingCardSegment) || (index > 0 && sectionChrome(sections[index - 1]) === "card");
  const nextIsCard = index < sections.length - 1 && sectionChrome(sections[index + 1]) === "card";
  return sectionStackPosition(previousIsCard, nextIsCard);
}

function sectionNavigationTitle(section: BodySurfaceSectionSpec) {
  return section.label ?? section.header?.title ?? null;
}

function MobileSectionDrilldown({ sections }: { sections: BodySurfaceSectionSpec[] }) {
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
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{sectionNavigationTitle(section)}</span>
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
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{sectionNavigationTitle(activeSection)}</span>
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
      {renderBodySection(activeSection)}
    </div>
  );
}

function BodySurfaceSectionStack({ sections, layout = "stack", gridColumns = 2, leadingCardSegment = false, mobilePresentation = "stack" }: { sections?: BodySurfaceSectionSpec[]; layout?: "stack" | "grid"; gridColumns?: BodySurfaceSectionGridColumns; leadingCardSegment?: boolean; mobilePresentation?: "stack" | "drilldown" }) {
  if (!sections?.length) return null;
  if (layout === "grid") {
    const gridClassName = gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><div className={`grid items-stretch gap-4 ${gridClassName}`}>{sections.map((section) => renderBodySection(section, true))}</div></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>;
  }
  const canDrillDown = mobilePresentation === "drilldown"
    && sections.length > 1
    && sections.every((section) => sectionNavigationTitle(section) !== null);
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider>
      {canDrillDown ? <MobileSectionDrilldown sections={sections} /> : null}
      <div className={`${PAGE_SURFACE_BODY_SECTION_STACK_CLASS} ${canDrillDown ? "max-sm:hidden" : ""}`}>
        {sections.map((section, index) => renderBodySection(section, false, stackPositionForSection(sections, index, leadingCardSegment)))}
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

function renderSplitSide(props: BodySurfaceSplitSectionProps, mode: SplitWorkspaceMode, onNavigateToDetail?: () => void) {
  const body = mode === "mobile" ? props.drawerLeft ?? props.left : props.left;
  return <BodySurface {...(onNavigateToDetail ? withMobileSplitNavigation(body, onNavigateToDetail) : body)} />;
}

function renderSectionContent(props: BodySurfaceSectionProps) {
  if (props.layout === "split") {
    if (props.splitPresentation === "fixed-sidebar") {
      return (
        <SplitWorkspace
          sideOpen
          sideLabel={props.sideLabel || "列表"}
          renderSide={(mode, onNavigateToDetail) => renderSplitSide(props, mode, onNavigateToDetail)}
          desktopPresentation="fixed-sidebar"
        >
          <BodySurface {...props.right} />
        </SplitWorkspace>
      );
    }
    return (
      <div className="space-y-3">
        <SplitWorkspace
          sideOpen={props.sideOpen}
          sideLabel={props.sideLabel}
          renderSide={(mode, onNavigateToDetail) => renderSplitSide(props, mode, onNavigateToDetail)}
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
        layout={props.layout}
        gridColumns={props.gridColumns}
        mobilePresentation={props.mobilePresentation}
      />
    ) : null,
  ].filter(Boolean);

  if (!blocks.length) return renderBodyEmpty(props.empty);
  return blocks;
}

function renderSectionSurface(props: BodySurfaceSectionProps) {
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><div className="space-y-4">
      {renderCommands(props.commands)}
      {renderBodyTitle(props)}
      {renderSectionContent(props)}
      {renderBodyModals(props.modals)}
    </div></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>
  );
}

export default function BodySurface(props: BodySurfaceProps) {
  assertNoSurfaceExplanatoryText(props);
  if (props.kind === "create") {
    return props.create.presentation === "inline" ? null : <CreateSurface {...props.create} />;
  }
  if (props.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={props.anchor} />;
  if (props.kind === "data") return <DataSurface {...props.data} />;
  if (props.kind === "document") return <DocumentSurface {...props.document} />;
  if (props.kind === "form") return <FormSurface {...props.form} />;
  if (props.kind === "selector") return <SelectorSurface {...props.selector} />;
  if (props.kind === "section") return renderSectionSurface(props);
  return <VisualizationSurface {...props.visualization} />;
}
