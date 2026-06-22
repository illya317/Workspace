import type { AccordionTabItem } from "../AccordionTabBar";

export type TemplateKind = "table" | "split" | "form" | "analysis" | "document" | "production" | "upload";
export type EmbeddedKind = "form" | "document" | "production";

export interface EmbeddedTemplate {
  title: string;
  kind: EmbeddedKind;
  fields?: string[];
  previewAction?: boolean;
  paperMode?: "record" | "template";
  routes?: string[];
}

export interface PageTemplate {
  key: string;
  label: string;
  title: string;
  kind: TemplateKind;
  section?: string;
  group?: string;
  fields?: string[];
  tableColumns?: string[];
  listItems?: string[];
  routes?: string[];
  toolbar?: boolean;
  footer?: boolean;
  previewAction?: boolean;
  paperMode?: "record" | "template";
  embedded?: EmbeddedTemplate;
}

export interface ModuleTemplate {
  key: string;
  label: string;
  summary?: string;
  overviewLabel: string;
  entryRoutes?: string[];
  pages: PageTemplate[];
}

export interface PageStyleRouteChild {
  key: string;
  label: string;
  route: string;
}

export interface PageStyleRouteModule {
  key: string;
  label: string;
  route: string;
  children: PageStyleRouteChild[];
}

export interface PageViewNode {
  key: string;
  label: string;
  resourceKey?: string;
  children?: PageViewNode[];
}

export interface PageViewDefinition {
  route: string;
  moduleKey: string;
  label: string;
  views: PageViewNode[];
  recordRoutes?: string[];
}

export interface PageGroup {
  key: string;
  label: string;
  pages: PageTemplate[];
}

export function getModuleSections(module: ModuleTemplate) {
  const labels = new Set<string>();
  for (const page of module.pages) labels.add(page.section ?? module.overviewLabel);
  return [...labels].map((label) => ({ key: label, label }));
}

export function getPreviewPages(module: ModuleTemplate, sectionKey: string) {
  return module.pages.filter((page) => (page.section ?? module.overviewLabel) === sectionKey);
}

export function getPageGroups(module: ModuleTemplate, sectionKey: string): PageGroup[] {
  const groups: PageGroup[] = [];
  for (const page of getPreviewPages(module, sectionKey)) {
    const label = page.group ?? page.label;
    const key = label;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.pages.push(page);
    else groups.push({ key, label, pages: [page] });
  }
  return groups;
}

export function getPageGroupTabs(module: ModuleTemplate, sectionKey: string): AccordionTabItem[] {
  return getPageGroups(module, sectionKey).map((group) => ({
    key: group.key,
    label: group.label,
    children: group.pages.map((page) => ({ key: page.key, label: page.label })),
  }));
}

export function isRecordRoute(route: string) {
  return /\[[^\]]+\]/.test(route);
}

export function getTemplateRoutes(module: ModuleTemplate) {
  const routes = new Set(module.entryRoutes ?? []);
  for (const page of module.pages) {
    for (const route of page.routes ?? []) routes.add(route);
    for (const route of page.embedded?.routes ?? []) routes.add(route);
  }
  return [...routes];
}

export function validateTemplateHierarchy(modules: ModuleTemplate[]) {
  const errors: string[] = [];
  for (const moduleItem of modules) {
    for (const page of moduleItem.pages) {
      for (const route of page.routes ?? []) {
        if (isRecordRoute(route)) errors.push(`${moduleItem.key}.${page.key}: record route ${route} must be embedded`);
      }
      if (/详情|编辑|预览|弹窗/.test(page.label)) errors.push(`${moduleItem.key}.${page.key}: single-record label must be embedded`);
    }
  }
  return errors;
}
