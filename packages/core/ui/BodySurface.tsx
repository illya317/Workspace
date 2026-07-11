"use client";

import DataSurface from "./DataSurface";
import CreateSurface from "./CreateSurface";
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

function renderSectionHeader(section: BodySurfaceSectionSpec, chrome: BodySurfaceSectionChrome = sectionChrome(section)) {
  const header = section.header;
  if (!header?.title && !header?.badges?.length && !header?.actions?.length && !header?.create) return null;
  const actions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
      </div>
      {header.actions?.length || header.create ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {header.create ? <CreateSurface {...header.create} /> : null}
          {header.actions?.length ? actions : null}
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
      footer={modal.pagination ? <NavigationSurface kind="pagination" pagination={modal.pagination} /> : undefined}
    >
      <BodySurfaceSectionStack sections={modal.sections} />
    </DetailModal>
  ));
}

function renderBodySection(section: BodySurfaceSectionSpec, stretch = false, stackPosition?: BodySectionStackPosition) {
  if (section.body.kind === "create" && section.body.create.presentation === "inline") return null;
  const stretchClassName = stretch ? "h-full" : "";
  const chrome = sectionChrome(section);
  const sectionClassName = joinClassNames(
    chrome === "card" ? sectionCardClassName(stackPosition) : "space-y-4",
    chrome === "plain" && section.header?.title ? "pt-2" : "",
    stretchClassName,
  );
  return (
    <BodySurfaceSectionFrame key={section.key} revealKey={section.key} itemRef={section.itemRef} className={stretchClassName}>
      <section className={sectionClassName}>{renderSectionHeader(section, chrome)}<BodySurface {...section.body} /></section>
    </BodySurfaceSectionFrame>
  );
}

function stackPositionForSection(sections: BodySurfaceSectionSpec[], index: number, leadingCardSegment = false): BodySectionStackPosition | undefined {
  if (sectionChrome(sections[index]) !== "card") return undefined;
  const previousIsCard = (index === 0 && leadingCardSegment) || (index > 0 && sectionChrome(sections[index - 1]) === "card");
  const nextIsCard = index < sections.length - 1 && sectionChrome(sections[index + 1]) === "card";
  return sectionStackPosition(previousIsCard, nextIsCard);
}

function BodySurfaceSectionStack({ sections, layout = "stack", gridColumns = 2, leadingCardSegment = false }: { sections?: BodySurfaceSectionSpec[]; layout?: "stack" | "grid"; gridColumns?: BodySurfaceSectionGridColumns; leadingCardSegment?: boolean }) {
  if (!sections?.length) return null;
  if (layout === "grid") {
    const gridClassName = gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><div className={`grid items-stretch gap-4 ${gridClassName}`}>{sections.map((section) => renderBodySection(section, true))}</div></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>;
  }
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider><div className={PAGE_SURFACE_BODY_SECTION_STACK_CLASS}>
      {sections.map((section, index) => renderBodySection(section, false, stackPositionForSection(sections, index, leadingCardSegment)))}
    </div></BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>
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

function renderSplitSide(props: BodySurfaceSplitSectionProps, mode: SplitWorkspaceMode) {
  const body = mode === "drawer" ? props.drawerLeft ?? props.left : props.left;
  return <BodySurface {...body} />;
}

function renderSectionContent(props: BodySurfaceSectionProps) {
  if (props.layout === "split") {
    if (props.splitPresentation === "fixed-sidebar") {
      return (
        <div className="grid gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
          <div className="max-lg:order-last min-w-0"><BodySurface {...props.left} /></div>
          <div className="min-w-0"><BodySurface {...props.right} /></div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
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
