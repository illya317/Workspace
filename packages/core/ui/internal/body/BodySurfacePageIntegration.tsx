import type { ReactNode } from "react";
import BodySurface from "../../BodySurface";
import CreateSurface from "../../CreateSurface";
import type {
  BodySurfaceEmptySpec,
  BodySurfaceProps,
  BodySurfaceSectionSpec,
  BodySurfaceSplitSectionProps,
} from "../../BodySurface.types";
import type { CreateSurfaceToolbarProps } from "../../CreateSurface.types";
import type { SurfaceToolbarItems } from "../../SurfaceContractTypes";
import { EmptyStateCard, ModuleCard } from "../common/Card";
import { renderBodyEmpty } from "./BodySurfaceBlocks";

function visitBodySurface(body: BodySurfaceProps | undefined, visitor: (body: BodySurfaceProps) => boolean): boolean {
  if (!body) return false;
  if (visitor(body)) return true;
  if (body.kind !== "section") return false;
  if (body.layout === "split") {
    return visitBodySurface(body.left, visitor)
      || visitBodySurface(body.drawerLeft, visitor)
      || visitBodySurface(body.right, visitor);
  }
  return Boolean(body.sections?.some((section) => visitBodySurface(section.body, visitor)));
}

function collectToolbarCreateSurfaces(body?: BodySurfaceProps): CreateSurfaceToolbarProps[] {
  if (!body) return [];
  if (body.kind === "create") {
    return body.create.trigger === "toolbar" && body.create.canCreate !== false ? [body.create] : [];
  }
  if (body.kind !== "section") return [];
  if (body.layout === "split") {
    return [body.left, body.drawerLeft, body.right].flatMap((child) => collectToolbarCreateSurfaces(child));
  }
  return (body.sections ?? []).flatMap((section) => collectToolbarCreateSurfaces(section.body));
}

function toolbarCreateSurface(body?: BodySurfaceProps) {
  const surfaces = collectToolbarCreateSurfaces(body);
  if (surfaces.length > 1) throw new Error("PageSurface 只允许声明一个 toolbar CreateSurface");
  return surfaces[0];
}

function collectSplitToolbarSources(body?: BodySurfaceProps): BodySurfaceSplitSectionProps[] {
  if (!body || body.kind !== "section") return [];
  if (body.layout === "split") {
    if (body.splitPresentation === "fixed-sidebar" || body.showSideControls === false) return [];
    return [body];
  }
  return (body.sections ?? []).flatMap((section) => collectSplitToolbarSources(section.body));
}

function splitPageToolbarItems(body?: BodySurfaceProps): SurfaceToolbarItems {
  const sources = collectSplitToolbarSources(body);
  if (sources.length > 1) throw new Error("PageSurface 只允许一个 split Surface 派生侧栏控制");
  const split = sources[0];
  if (!split) return [];
  return [
    {
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: `显示${split.sideLabel}`,
      onClick: () => split.onDrawerOpenChange(true),
      visibility: "mobile",
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: split.sideOpen ? "panel-close" : "panel-open",
      label: `${split.sideOpen ? "隐藏" : "显示"}${split.sideLabel}`,
      onClick: () => split.onSideOpenChange(!split.sideOpen),
      variant: split.sideOpen ? "primary" : "secondary",
      visibility: "desktop",
    },
  ];
}

export function bodySurfacePageToolbarItems(body?: BodySurfaceProps): SurfaceToolbarItems {
  const create = toolbarCreateSurface(body);
  const createItems: SurfaceToolbarItems = create ? [{
    kind: "create",
    key: create.id,
    label: "新增",
    active: create.open,
    disabled: create.disabled,
    onClick: () => create.onOpenChange(true),
  }] : [];
  return [...createItems, ...splitPageToolbarItems(body)];
}

export function renderBodySurfaceAfterToolbar(body?: BodySurfaceProps) {
  const create = toolbarCreateSurface(body);
  return create?.presentation === "inline" ? <CreateSurface {...create} /> : null;
}

export function bodySurfaceHasLoginForm(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "form" && node.form.kind === "login");
}

export function bodySurfaceHasSplit(body?: BodySurfaceProps) {
  return visitBodySurface(body, (node) => node.kind === "section" && node.layout === "split");
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
  if (body.layout === "split") return findLoginForm(body.right) ?? findLoginForm(body.left) ?? findLoginForm(body.drawerLeft);
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
          <div className="mb-8 flex flex-col items-center">
            {grid.leading}
            {grid.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{grid.title}</h1> : null}
            {grid.summary ? <p className="mt-1 text-center text-sm text-gray-500">{grid.summary}</p> : null}
          </div>
        )}
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grid.items.map((item) => {
            const { key, ...props } = item;
            return <ModuleCard key={key} {...props} />;
          })}
        </div>
        {grid.afterGrid ? <div className="mt-8 w-full max-w-4xl">{grid.afterGrid}</div> : null}
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
