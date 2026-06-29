"use client";

import { EmptyStateCard } from "../common/Card";
import BodySurface from "../../BodySurface";
import DetailModal from "../common/DetailModal";
import TabBar from "../common/TabBar";
import { Toolbar } from "../../Toolbar";
import { joinClassNames } from "../common/card-utils";
import { renderCommands } from "./PageSurface.commands";
import type {
  PageSurfaceBadgeSpec,
  PageSurfaceEmptySpec,
  PageSurfaceModalSpec,
  PageSurfaceSectioningSpec,
  PageSurfaceSectionSpec,
  PageSurfaceToolbarSpec,
} from "../../PageSurface.types";

const MODAL_MAX_WIDTH_BY_SIZE = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

export function renderToolbar(toolbar?: PageSurfaceToolbarSpec) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} />;
}

export function renderEmpty(empty?: PageSurfaceEmptySpec) {
  if (!empty) return null;
  if (empty.presentation === "plain") {
    return <div className="text-sm text-slate-500">{empty.content}</div>;
  }
  return <EmptyStateCard compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function badgeClassName(tone: PageSurfaceBadgeSpec["tone"] = "default") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  if (tone === "danger") return "bg-rose-50 text-rose-600";
  if (tone === "info") return "bg-sky-50 text-sky-700";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-700";
}

function renderSectionBadges(badges?: PageSurfaceBadgeSpec[]) {
  if (!badges?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span key={badge.key} className={`rounded px-2 py-1 text-xs font-medium ${badgeClassName(badge.tone)}`}>{badge.label}</span>
      ))}
    </div>
  );
}

function renderSectionHeader(section: PageSurfaceSectionSpec) {
  const header = section.header;
  if (!header?.title && !header?.subtitle && !header?.badges?.length && !header?.actions?.length) return null;
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
      {renderCommands(header.actions)}
    </div>
  );
}

function activeBodySection(sections: PageSurfaceSectionSpec[], active: string) {
  return sections.find((section) => section.key === active) ?? sections[0] ?? null;
}

function renderSectionContent(section: PageSurfaceSectionSpec) {
  if (section.body.kind === "section" && section.body.sections) {
    return renderSectionStack(section.body.sections, section.body.sectioning, undefined, section.body.layout);
  }
  return <BodySurface {...section.body} />;
}

export function renderPageModals(modals?: PageSurfaceModalSpec[]) {
  if (!modals?.length) return null;
  return modals.map((modal) => (
    <DetailModal
      key={modal.key}
      open={modal.open}
      title={modal.title}
      onClose={modal.onClose}
      maxWidth={modal.size ? MODAL_MAX_WIDTH_BY_SIZE[modal.size] : undefined}
    >
      {renderSectionStack(modal.sections)}
    </DetailModal>
  ));
}

function renderPageSection(section: PageSurfaceSectionSpec) {
  return (
    <section key={section.key} className={section.framed === false ? "space-y-4" : "space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm"}>
      {renderSectionHeader(section)}
      {renderSectionContent(section)}
    </section>
  );
}

export function renderSectionStack(
  sections?: PageSurfaceSectionSpec[],
  sectioning?: PageSurfaceSectioningSpec,
  className?: string,
  layout: "stack" | "grid" = "stack",
) {
  if (!sections?.length) return null;
  if (sectioning?.kind === "tabs") {
    const active = activeBodySection(sections, sectioning.active);
    return (
      <div className={joinClassNames("space-y-5", className)}>
        <TabBar
          kind="table"
          variant="lineLarge"
          className="border-b-0 pb-0"
          tabs={sections.map((section) => ({ key: section.key, label: section.label ?? section.key }))}
          active={active?.key ?? sectioning.active}
          onChange={(key) => sectioning.kind === "tabs" ? sectioning.onChange?.(key) : undefined}
        />
        {active ? renderPageSection(active) : null}
      </div>
    );
  }
  if (layout === "grid") {
    return <div className={joinClassNames("grid gap-4 lg:grid-cols-2", className)}>{sections.map(renderPageSection)}</div>;
  }
  return <div className={joinClassNames("space-y-5", className)}>{sections.map(renderPageSection)}</div>;
}

export function PageSurfaceSectionStack({
  sections,
  className,
  sectioning,
  layout = "stack",
}: {
  sections?: PageSurfaceSectionSpec[];
  className?: string;
  sectioning?: PageSurfaceSectioningSpec;
  layout?: "stack" | "grid";
}) {
  return renderSectionStack(sections, sectioning, className, layout);
}
