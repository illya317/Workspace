import type { ReactNode } from "react";
import BodySurface from "../../BodySurface";
import type {
  BodySurfaceEmptySpec,
  BodySurfaceProps,
  BodySurfaceSectionSpec,
  BodySurfaceSplitSectionProps,
} from "../../BodySurface.types";
import type { SurfaceToolbarItems } from "../../SurfaceContractTypes";
import { EmptyStateCard, ModuleCard } from "../common/Card";
import type { BodySurfaceSplitRuntime } from "./BodySurfaceSplitContext";
import { renderBodyEmpty } from "./BodySurfaceBlocks";

function visitBodySurface(body: BodySurfaceProps | undefined, visitor: (body: BodySurfaceProps) => boolean): boolean {
  if (!body) return false;
  if (visitor(body)) return true;
  if (body.kind !== "section") return false;
  if (body.layout === "split") {
    return visitBodySurface(body.master.body, visitor)
      || visitBodySurface(body.master.mobileBody, visitor)
      || visitBodySurface(body.detail, visitor);
  }
  return Boolean(body.sections?.some((section) => visitBodySurface(section.body, visitor)));
}

function collectSplitToolbarSources(body?: BodySurfaceProps): BodySurfaceSplitSectionProps[] {
  if (!body || body.kind !== "section") return [];
  if (body.layout === "split") {
    return [body];
  }
  return (body.sections ?? []).flatMap((section) => collectSplitToolbarSources(section.body));
}

function splitPageToolbarItems(body: BodySurfaceProps | undefined, runtime: BodySurfaceSplitRuntime | null): SurfaceToolbarItems {
  const sources = collectSplitToolbarSources(body);
  if (sources.length > 1) throw new Error("PageSurface 只允许一个 split Surface 派生侧栏控制");
  const split = sources[0];
  if (!split || !runtime) return [];
  return [
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: runtime.open ? "panel-close" : "panel-open",
      label: `${runtime.open ? "隐藏" : "显示"}${split.master.label}`,
      disabled: runtime.disabled,
      onClick: () => runtime.onOpenChange(!runtime.open),
      variant: runtime.open ? "primary" : "secondary",
      visibility: "desktop",
    },
  ];
}

export function bodySurfacePageToolbarItems(
  body: BodySurfaceProps | undefined,
  splitRuntime: BodySurfaceSplitRuntime | null = null,
): SurfaceToolbarItems {
  return splitPageToolbarItems(body, splitRuntime);
}

export function bodySurfaceHasLoginForm(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "form" && node.form.kind === "login");
}

export function bodySurfaceHasSplit(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "section" && node.layout === "split");
}

export function bodySurfacePageCreatePlacement(body?: BodySurfaceProps): "page" | "split-detail" {
  return bodySurfaceHasSplit(body) ? "split-detail" : "page";
}

export function bodySurfaceHasDirectoryContent(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "section" && (Boolean(node.empty) || Boolean(node.moduleGrid)));
}

export function renderBodySurfaceLoginForm(body?: BodySurfaceProps) {
  const form = findLoginForm(body);
  return form ? <BodySurface {...form} /> : null;
}

function findLoginForm(body?: BodySurfaceProps): BodySurfaceProps | undefined {
  if (!body) return undefined;
  if (body.kind === "form" && body.form.kind === "login") return body;
  if (body.kind !== "section") return undefined;
  if (body.layout === "split") return findLoginForm(body.detail) ?? findLoginForm(body.master.body) ?? findLoginForm(body.master.mobileBody);
  for (const section of body.sections ?? []) {
    const form = findLoginForm(section.body);
    if (form) return form;
  }
  return undefined;
}

function renderDirectoryEmpty(empty?: BodySurfaceEmptySpec, key?: string) {
  if (!empty) return null;
  if (empty.presentation === "plain") return <div key={key} className="text-center text-sm text-slate-500">{empty.content}</div>;
  return <EmptyStateCard key={key} compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function renderDirectorySection(section: BodySurfaceSectionSpec): ReactNode {
  return renderBodySurfaceDirectory(section.body, section);
}

export function renderBodySurfaceDirectory(body: BodySurfaceProps | undefined, section?: BodySurfaceSectionSpec): ReactNode {
  if (!body || body.kind !== "section" || body.layout === "split") return null;
  if (body.empty) return renderDirectoryEmpty(body.empty, section?.key);
  if (body.moduleGrid) {
    const grid = body.moduleGrid;
    return (
      <div key={section?.key} className="flex w-full flex-col items-center justify-center">
        {(grid.leading || grid.title || grid.summary) && (
          <div className="mb-5 flex w-full flex-col items-start sm:mb-8 sm:items-center">
            {grid.leading}
            {grid.title ? <h1 className="mt-3 text-xl font-bold tracking-tight text-gray-800 sm:mt-4 sm:text-2xl">{grid.title}</h1> : null}
            {grid.summary ? <p className="mt-1 text-left text-sm text-gray-500 sm:text-center">{grid.summary}</p> : null}
          </div>
        )}
        <div className="grid w-full max-w-4xl grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {grid.items.map((item) => {
            const { key, ...props } = item;
            return <ModuleCard key={key} {...props} />;
          })}
        </div>
        {grid.afterGrid ? <div className="mt-6 w-full max-w-4xl sm:mt-8">{grid.afterGrid}</div> : null}
      </div>
    );
  }
  if (body.sections?.length) {
    const gridClassName = body.gridColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
    return (
      <div key={section?.key} className="space-y-5">
        {section?.header?.title ? <h1 className="text-center text-2xl font-bold text-gray-800">{section.header.title}</h1> : null}
        <div className={body.layout === "grid" ? `grid gap-4 ${gridClassName}` : "space-y-5"}>
          {body.sections.map(renderDirectorySection)}
        </div>
      </div>
    );
  }
  return renderBodyEmpty(body.empty);
}
