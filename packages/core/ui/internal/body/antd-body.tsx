"use client";

import {
  Alert,
  Empty,
  Modal,
  Skeleton,
  Spin,
} from "antd";
import CreateSurface from "../../CreateSurface";
import DocumentSurface from "../../DocumentSurface";
import FormSurface from "../../FormSurface";
import NavigationSurface from "../../NavigationSurface";
import SelectorSurface from "../../SelectorSurface";
import VisualizationSurface from "../../VisualizationSurface";
import type {
  BodySurfaceComposedSectionProps,
  BodySurfaceEmptySpec,
  BodySurfaceMessageSpec,
  BodySurfaceModalSpec,
  BodySurfaceSectionBodyProps,
  BodySurfaceSectionGridColumns,
  BodySurfaceSectionSpec,
  BodySurfaceSplitSectionProps,
  BodySurfaceStatusSpec,
  BodySurfaceProps,
} from "../../BodySurface.types";
import { CreateStartButton } from "../action/CreateActionControls";
import { CreateSurfaceAnchorProvider, CreateSurfaceAnchorTarget } from "../create/CreateSurfaceAnchorContext";
import { AntdSectionBadges } from "./antd-body-badges";
import { AntdMobileSectionDrilldown } from "./antd-body-drilldown";
import { canDrilldownSections } from "./body-surface-drilldown";
import {
  bodySurfaceRootOwnsFrame,
  resolveBodySurfaceSectionChrome,
  resolveBodySurfaceSectionStackPosition,
} from "./body-surface-section-chrome";
import { renderModuleGrid } from "./BodySurfaceBlocks";
import { BodySurfaceList } from "./BodySurfaceList";
import { BodySurfaceRevealProvider } from "./BodySurfaceRevealContext";
import { BodySurfaceSectionFrame } from "./BodySurfaceSectionParts";
import { sectionCardClassName, type BodySectionStackPosition } from "./BodySurfaceSectionStack.styles";
import { SurfaceFrameBoundary, useSurfaceFrameDepth } from "../common/SurfaceFrameContextParts";
import SplitWorkspace, { type SplitWorkspaceMode } from "../common/SplitWorkspace";
import { AntdDataSurface } from "../data/antd-data";
import { renderAntdCommands } from "../common/antd-command";
import { joinClassNames } from "../common/card-utils";
import { textOverflowTitle } from "../common/text-overflow";
import { useBodySurfacePageCreate } from "./BodySurfacePageCreateContext";
import { useBodySurfaceSplitRuntime } from "./BodySurfaceSplitContext";
import { sectionVisibilityClassName } from "./body-surface-visibility";
import { PAGE_SURFACE_BODY_SECTION_STACK_CLASS } from "../page/PageSurface.spacing";

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
    return (
      <Spin key="status" description={status.content}>
        <Skeleton active paragraph={{ rows: status.compact ? 1 : 3 }} title={!status.compact} />
      </Spin>
    );
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

// 与 legacy DetailModal 的 maxWidth 档位一致(sm/md/lg/xl),缺省对应 max-w-lg。
const MODAL_WIDTH_BY_SIZE = { sm: 448, md: 672, lg: 896, xl: 1152 } as const;

// Top-level modal chrome and nested body dispatch are both owned by the Ant path.
function AntdBodyModals({ modals }: { modals?: BodySurfaceModalSpec[] }) {
  if (!modals?.length) return null;
  return modals.map((modal) => (
    <Modal
      destroyOnHidden
      footer={modal.actions?.length || modal.pagination ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {modal.pagination ? <NavigationSurface kind="pagination" pagination={modal.pagination} /> : <span />}
          <div className="ml-auto">{renderAntdCommands(modal.actions)}</div>
        </div>
      // 无 actions/pagination 时显式 footer=null,避免 antd 默认确认/取消按钮。
      ) : null}
      key={modal.key}
      keyboard={false}
      mask={{ closable: false }}
      onCancel={modal.onClose}
      open={modal.open}
      title={modal.title}
      width={modal.size ? MODAL_WIDTH_BY_SIZE[modal.size] : 512}
    >
      {/* 与 legacy 一致:弹层内容整体抬高一层框架深度。 */}
      <SurfaceFrameBoundary framed>
        <AntdSectionStack sections={modal.sections} />
      </SurfaceFrameBoundary>
    </Modal>
  ));
}

function AntdSectionBody({ body }: { body: BodySurfaceSectionBodyProps }) {
  if (body.kind === "data") {
    return <AntdDataSurface data={body.data} />;
  }
  if (body.kind === "form") return <FormSurface {...body.form} />;
  if (body.kind === "visualization") return <div className="min-h-30"><VisualizationSurface {...body.visualization} /></div>;
  if (body.kind === "document") return <DocumentSurface {...body.document} />;
  if (body.kind === "selector") return <SelectorSurface {...body.selector} />;
  if (body.kind === "create") return <CreateSurface {...body.create} />;
  if (body.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={body.anchor} />;
  if (body.layout === "split") return <AntdSplitBody body={body} />;
  return <AntdComposedBody body={body} />;
}

function AntdBodySection({
  section,
  stretch = false,
  stackPosition,
  frameDepth = 0,
}: {
  section: BodySurfaceSectionSpec;
  stretch?: boolean;
  stackPosition?: BodySectionStackPosition;
  frameDepth?: number;
}) {
  const header = section.header;
  const disclosure = section.disclosure;
  const chrome = resolveBodySurfaceSectionChrome(section, frameDepth);
  const title = header?.title ?? section.label;
  const create = header?.create;
  const blockCreate = create?.presentation === "block"
    ? { ...create, anchor: `body-section-create:${create.id}` }
    : null;
  const createControl = create?.presentation === "row"
    ? create.canCreate !== false ? <CreateStartButton label={create.title} disabled={create.disabled} onClick={create.onCreate} size="sm" /> : null
    : blockCreate ? <CreateSurface {...blockCreate} /> : null;
  const badges = header?.badges?.length ? <AntdSectionBadges badges={header.badges} /> : null;
  const extra = header?.actions?.length || createControl ? (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {createControl}
      {renderAntdCommands(header?.actions)}
    </div>
  ) : undefined;
  const hasHeader = Boolean(title || badges || header?.actions?.length || createControl);
  const headerNode = hasHeader ? (
    <div className={joinClassNames(
      "flex items-start justify-between gap-3",
      chrome === "divider" ? "border-b border-slate-200 pb-3" : "",
    )}>
      <div className="min-w-0 space-y-1.5">
        {title || badges ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {disclosure ? (
              <button
                aria-expanded={disclosure.expanded}
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => disclosure.onExpandedChange(!disclosure.expanded)}
                type="button"
              >
                <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">
                  {disclosure.expanded ? "▼" : "▶"}
                </span>
                <h3 className="truncate text-base font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</h3>
              </button>
            ) : title ? (
              <h3 className="truncate text-base font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</h3>
            ) : null}
            {badges}
          </div>
        ) : null}
      </div>
      {extra}
    </div>
  ) : null;
  const mobileFlushData = chrome === "card"
    && section.body.kind === "data"
    && (section.body.data.kind === "table" || section.body.data.kind === "structured");
  const nestedSection = frameDepth > 0;
  const sectionLayoutClassName = nestedSection
    ? sectionCardClassName(stackPosition, true)
    : chrome === "card"
      ? sectionCardClassName(stackPosition)
      : "space-y-4";
  const stretchClassName = stretch ? "h-full" : "";
  const sectionClassName = joinClassNames(
    sectionLayoutClassName,
    chrome === "plain" && header?.title ? "pt-2" : "",
    mobileFlushData ? "max-sm:!space-y-0 max-sm:!p-0" : "",
    stretchClassName,
  );
  // 与既有契约一致:受控折叠,收起时不渲染内容;Core chrome 决定 card/divider/plain，
  // 内容仅在根 card 下抬高框架深度，嵌套 title/commands 不重复独占 primary 框架。
  const content = !disclosure || disclosure.expanded ? (
    <SurfaceFrameBoundary framed={chrome === "card"}><AntdSectionBody body={section.body} /></SurfaceFrameBoundary>
  ) : null;
  // BodySurfaceSectionFrame 承载 itemRef(scroll/reveal 语义)与可见性,与 legacy 同一实现。
  return (
    <BodySurfaceSectionFrame
      className={joinClassNames(stretchClassName, sectionVisibilityClassName(section.visibility))}
      itemRef={section.itemRef}
      revealKey={section.key}
      visibility={section.visibility}
    >
      <section className={sectionClassName} data-surface-frame={chrome === "card" ? "primary" : undefined}>
        {mobileFlushData && headerNode ? <div className="px-3 pb-3 pt-3">{headerNode}</div> : headerNode}
        {blockCreate ? <CreateSurfaceAnchorTarget anchor={blockCreate.anchor} /> : null}
        {content}
      </section>
    </BodySurfaceSectionFrame>
  );
}

export function AntdSectionStack({
  sections,
  layout = "stack",
  gridColumns = 2,
  leadingCardSegment = false,
  mobilePresentation = "stack",
}: {
  sections?: BodySurfaceSectionSpec[];
  layout?: "stack" | "grid";
  gridColumns?: BodySurfaceSectionGridColumns;
  leadingCardSegment?: boolean;
  mobilePresentation?: "stack" | "drilldown";
}) {
  const frameDepth = useSurfaceFrameDepth();
  if (!sections?.length) return null;
  const className = layout === "grid"
    ? `grid items-stretch gap-4 ${gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`
    : PAGE_SURFACE_BODY_SECTION_STACK_CLASS;
  // 与 legacy canDrillDown 同一判定:仅 stack 布局、多章节且均有导航标题时启用
  // 移动端 drilldown;不满足时回退常规 stack,不静默丢失章节。
  const drilldown = layout !== "grid" && canDrilldownSections(sections, mobilePresentation);
  return (
    <CreateSurfaceAnchorProvider><BodySurfaceRevealProvider>
      {drilldown ? (
        <AntdMobileSectionDrilldown
          sections={sections}
          renderSection={(section) => <AntdBodySection frameDepth={frameDepth} section={section} />}
        />
      ) : null}
      <div className={drilldown ? `${className} max-sm:hidden` : className}>
        {sections.map((section, index) => (
          <AntdBodySection
            frameDepth={frameDepth}
            key={section.key}
            section={section}
            stackPosition={layout === "grid"
              ? undefined
              : resolveBodySurfaceSectionStackPosition(sections, index, frameDepth, leadingCardSegment)}
            stretch={layout === "grid"}
          />
        ))}
      </div>
    </BodySurfaceRevealProvider></CreateSurfaceAnchorProvider>
  );
}

function withMobileSplitNavigation(body: BodySurfaceProps, onNavigateToDetail: () => void): BodySurfaceProps {
  if (body.kind === "selector") {
    const onSelect = body.selector.onSelect as (item: unknown) => void;
    return {
      ...body,
      selector: {
        ...body.selector,
        onSelect: (item: unknown) => { onSelect(item); onNavigateToDetail(); },
      },
    } as BodySurfaceProps;
  }
  if (body.kind !== "section" || body.layout === "split" || !body.sections?.length) return body;
  return {
    ...body,
    sections: body.sections.map((section) => ({
      ...section,
      body: withMobileSplitNavigation(section.body as BodySurfaceProps, onNavigateToDetail),
    })),
  };
}

function AntdSplitMaster({ body, mode, onNavigateToDetail }: {
  body: BodySurfaceSplitSectionProps;
  mode: SplitWorkspaceMode;
  onNavigateToDetail?: () => void;
}) {
  const source = mode === "mobile" ? body.master.mobileBody ?? body.master.body : body.master.body;
  const rendered = onNavigateToDetail ? withMobileSplitNavigation(source, onNavigateToDetail) : source;
  const pagination = body.master.footer?.pagination;
  return (
    <div className="space-y-3">
      <AntdBodySurface body={rendered} />
      {pagination && pagination.totalPages > 1 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <NavigationSurface kind="pagination" pagination={pagination} />
        </div>
      ) : null}
    </div>
  );
}

export function resolveAntdSplitMobileBack(
  pageCreate: { open: boolean; onOpenChange: (open: boolean) => void } | undefined,
  onNavigateToList: (() => void) | undefined,
) {
  if (!pageCreate?.open) return onNavigateToList;
  return () => {
    pageCreate.onOpenChange(false);
    onNavigateToList?.();
  };
}

function AntdSplitBody({ body }: { body: BodySurfaceSplitSectionProps }) {
  const splitRuntime = useBodySurfaceSplitRuntime();
  const pageCreate = useBodySurfacePageCreate();
  const frameDepth = useSurfaceFrameDepth();
  const ownsFrame = bodySurfaceRootOwnsFrame(body, frameDepth);
  const split = body.status ? renderAntdStatus(body.status) : (
    <SplitWorkspace
      desktopPresentation={body.desktop?.presentation}
      masterPresentation={body.master.presentation}
      mobileDetailActive={pageCreate?.open ? true : body.mobile?.detailActive}
      onMobileNavigateToList={resolveAntdSplitMobileBack(pageCreate, body.mobile?.onNavigateToList)}
      renderSide={(mode, onNavigateToDetail) => <AntdSplitMaster body={body} mode={mode} onNavigateToDetail={onNavigateToDetail} />}
      sideLabel={body.master.label}
      sideOpen={pageCreate?.open ? true : splitRuntime?.open ?? true}
      splitRatio={body.desktop?.ratio}
    >
      {pageCreate?.open ? <CreateSurface {...pageCreate} trigger="toolbar" /> : <AntdBodySurface body={body.detail} />}
    </SplitWorkspace>
  );
  const content = (
    <>
      {renderAntdMessage(body.message)}
      {split}
      <AntdBodyModals modals={body.modals} />
    </>
  );
  if (!body.title && !body.commands?.length) return content;
  return (
    <SurfaceFrameBoundary framed={ownsFrame}>
      <section className={ownsFrame ? sectionCardClassName() : "space-y-4"} data-surface-frame={ownsFrame ? "primary" : undefined}>
        {renderAntdCommands(body.commands)}
        {body.title ? <h2 className="text-lg font-semibold text-slate-900">{body.title}</h2> : null}
        {content}
      </section>
    </SurfaceFrameBoundary>
  );
}

export function AntdComposedBody({ body }: { body: BodySurfaceComposedSectionProps }) {
  const frameDepth = useSurfaceFrameDepth();
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
        mobilePresentation={body.mobilePresentation}
      />
    ) : null,
  ].filter(Boolean);
  const content = (
    <>
      {blocks.length ? blocks : renderAntdEmpty(body.empty)}
      <AntdBodyModals modals={body.modals} />
    </>
  );
  if (!body.title && !body.commands?.length) return content;
  // 顶层 title/commands 的框架语义与 legacy 一致:frameDepth 0 时根节点独占
  // primary 框架(bodySurfaceRootOwnsFrame),嵌套场景只渲染 title/commands 本身。
  const ownsFrame = bodySurfaceRootOwnsFrame(body, frameDepth);
  return (
    <SurfaceFrameBoundary framed={ownsFrame}>
      <section
        className={ownsFrame ? sectionCardClassName() : "space-y-4"}
        data-surface-frame={ownsFrame ? "primary" : undefined}
      >
        {renderAntdCommands(body.commands)}
        {body.title ? (
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">{body.title}</h2>
          </div>
        ) : null}
        {content}
      </section>
    </SurfaceFrameBoundary>
  );
}

/** Total body dispatcher used by both direct BodySurface and PageSurface. */
export function AntdBodySurface({ body }: { body: BodySurfaceProps }) {
  if (body.kind === "data") return <AntdDataSurface data={body.data} />;
  if (body.kind === "form") return <FormSurface {...body.form} />;
  if (body.kind === "document") return <DocumentSurface {...body.document} />;
  if (body.kind === "selector") return <SelectorSurface {...body.selector} />;
  if (body.kind === "visualization") return <VisualizationSurface {...body.visualization} />;
  if (body.kind === "create") return <CreateSurface {...body.create} />;
  if (body.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={body.anchor} />;
  return body.layout === "split" ? <AntdSplitBody body={body} /> : <AntdComposedBody body={body} />;
}
