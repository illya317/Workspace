import { createElement, type Ref } from "react";
import type {
  BlockSurfaceActionsProps,
  BlockSurfaceAnalysisProps,
  BlockSurfaceCommandSpec,
  BlockSurfaceEmptyProps,
  BlockSurfaceGroupProps,
  BlockSurfaceHeadingProps,
  BlockSurfaceMessageProps,
  BlockSurfaceModuleGridProps,
  BlockSurfacePanelProps,
  BlockSurfaceProps,
} from "../BlockSurface";
import type { DataSurfaceProps, DataSurfaceTableProps } from "../DataSurface.types";
import type { DocumentSurfaceProps } from "../DocumentSurface";
import type { FormSurfaceFieldModeProps, FormSurfaceLooseItem, FormSurfaceProps } from "../FormSurface.types";
import type { NavigationSurfaceTabsSpec } from "../NavigationSurface";
import type {
  PageSurfaceBodySpec,
  PageSurfaceCommandSpec,
  PageSurfaceCompleteBodySpec,
  PageSurfaceEmptySpec,
  PageSurfaceKind,
  PageSurfaceModalSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceSectionSpec,
  PageSurfaceToolbarSpec,
} from "../PageSurface.types";
import { PageSurfaceSectionStack } from "../internal/page/PageSurface.sections";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";

export type PageSurfaceBodySectionSpec = Exclude<PageSurfaceSectionSpec, { kind: "modal" }>;

type NestedPageSections = {
  sections: PageSurfaceSectionSpec[];
  layout?: "stack" | "grid";
};

type PageSectionPanelOptions =
  & Omit<BlockSurfacePanelProps, "kind" | "key" | "content" | "blocks" | "actions">
  & NestedPageSections
  & {
    actions?: PageSurfaceCommandSpec[];
    framed?: boolean;
    itemRef?: Ref<HTMLDivElement>;
  };

type PageSectionCardOptions = PageSectionPanelOptions & {
  title: NonNullable<BlockSurfacePanelProps["title"]>;
};

type PageSectionAnalysisOptions =
  & Omit<BlockSurfaceAnalysisProps, "kind" | "key" | "content" | "toolbarItems">
  & NestedPageSections
  & {
    toolbar?: PageSurfaceToolbarSpec;
  };

export interface PageSurfaceShellPropsOptions {
  kind: PageSurfaceKind;
  body?: PageSurfaceBodySpec;
  toolbar?: PageSurfaceProps["toolbar"];
  navigation?: PageSurfaceProps["navigation"];
  footer?: PageSurfaceProps["footer"];
  actions?: PageSurfaceCommandSpec[];
  empty?: PageSurfaceEmptySpec;
  embedded?: boolean;
}

export function createPageBody(
  sections: PageSurfaceSectionSpec[],
  options: Omit<PageSurfaceCompleteBodySpec, "kind" | "sections"> = {},
): PageSurfaceCompleteBodySpec & { sections: PageSurfaceSectionSpec[] } {
  return { kind: "complete", ...options, sections };
}

export function createPageTabsNavigation(
  navigation: Omit<PageSurfaceNavigationSpec, "kind">,
): PageSurfaceNavigationSpec {
  return {
    kind: "tabs",
    ...navigation,
  };
}

export function createTabsNavigationSection(
  key: string,
  tabs: NavigationSurfaceTabsSpec,
): Extract<PageSurfaceSectionSpec, { kind: "navigation" }> {
  return {
    kind: "navigation",
    key,
    surface: {
      kind: "tabs",
      tabs,
    },
  };
}

export function createPageCommand(command: PageSurfaceCommandSpec): PageSurfaceCommandSpec {
  return command;
}

export function createPageActionsSection(
  key: string,
  actions: BlockSurfaceCommandSpec[],
  options: Omit<BlockSurfaceActionsProps, "kind" | "key" | "actions"> = {},
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createActionsSection(key, actions, options);
}

export function createPageDataSection<T>(
  key: string,
  surface: DataSurfaceProps<T>,
): Extract<PageSurfaceSectionSpec, { kind: "data" }> {
  return { kind: "data", key, surface };
}

export function createPageTableSection<T>(
  key: string,
  table: Omit<DataSurfaceTableProps<T>, "kind">,
): Extract<PageSurfaceSectionSpec, { kind: "data" }> {
  return createPageDataSection<T>(key, { kind: "table", ...table });
}

export function createFormSection<T = FormSurfaceLooseItem>(
  key: string,
  surface: FormSurfaceProps<T>,
): Extract<PageSurfaceSectionSpec, { kind: "form" }> {
  return { kind: "form", key, surface };
}

export function createFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "fields" | "detail" } = {},
): Extract<PageSurfaceSectionSpec, { kind: "form" }> {
  const { kind = "fields", ...rest } = options;
  return createFormSection<T>(key, { kind, fields, ...rest });
}

export function createInlineFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "inline" | "filters" } = {},
): Extract<PageSurfaceSectionSpec, { kind: "form" }> {
  const { kind = "inline", ...rest } = options;
  return createFormSection<T>(key, { kind, fields, ...rest });
}

export function createDocumentSection(
  key: string,
  surface: DocumentSurfaceProps,
): Extract<PageSurfaceSectionSpec, { kind: "document" }> {
  return { kind: "document", key, surface };
}

export function createVisualizationSection(
  key: string,
  surface: VisualizationSurfaceProps,
): Extract<PageSurfaceSectionSpec, { kind: "visualization" }> {
  return { kind: "visualization", key, surface };
}

export function createBlockSurfaceSection(
  key: string,
  surface: BlockSurfaceProps,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return { kind: "block", key, surface };
}

export function createMessageSection(
  key: string,
  message: Omit<BlockSurfaceMessageProps, "kind" | "key">,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createBlockSurfaceSection(key, { kind: "message", ...message });
}

export function createEmptySection(
  key: string,
  empty: Omit<BlockSurfaceEmptyProps, "kind" | "key">,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createBlockSurfaceSection(key, { kind: "empty", ...empty });
}

export function createActionsSection(
  key: string,
  actions: BlockSurfaceActionsProps["actions"],
  options: Omit<BlockSurfaceActionsProps, "kind" | "key" | "actions"> = {},
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createBlockSurfaceSection(key, { kind: "actions", actions, ...options });
}

export function createHeadingSection(
  key: string,
  heading: Omit<BlockSurfaceHeadingProps, "kind" | "key">,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createBlockSurfaceSection(key, { kind: "heading", ...heading });
}

export function createSectionsSection(
  key: string,
  group: Omit<BlockSurfaceGroupProps, "kind" | "key" | "blocks"> & NestedPageSections,
): Extract<PageSurfaceSectionSpec, { kind: "sections" }> {
  const { layout = "stack", sections } = group;
  return { kind: "sections", key, layout, sections };
}

function nestedSectionContent(sections?: PageSurfaceSectionSpec[], layout?: "stack" | "grid") {
  return sections?.length ? createElement(PageSurfaceSectionStack, { sections, layout }) : undefined;
}

export function createPanelSection(
  key: string,
  panel: PageSectionPanelOptions,
): Extract<PageSurfaceSectionSpec, { kind: "sections" }> {
  const { actions, framed, layout = "stack", sections, subtitle, title } = panel;
  return {
    kind: "sections",
    key,
    label: title,
    framed,
    layout,
    header: { title, subtitle, actions },
    sections,
  };
}

export function createAnalysisSection(
  key: string,
  analysis: PageSectionAnalysisOptions,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  const { layout, sections, toolbar, ...rest } = analysis;
  return createBlockSurfaceSection(key, {
    kind: "analysis",
    ...(rest as Omit<BlockSurfaceAnalysisProps, "kind" | "key">),
    toolbarItems: toolbar?.items,
    content: nestedSectionContent(sections, layout),
  });
}

export function createSectionSection(
  key: string,
  section: PageSectionCardOptions,
): Extract<PageSurfaceSectionSpec, { kind: "sections" }> {
  return createPanelSection(key, section);
}

export function createModuleGridSection(
  key: string,
  moduleGrid: Omit<BlockSurfaceModuleGridProps, "kind" | "key">,
): Extract<PageSurfaceSectionSpec, { kind: "block" }> {
  return createBlockSurfaceSection(key, { kind: "moduleGrid", ...moduleGrid });
}

export function createPageModalSection(
  key: string,
  modal: Omit<PageSurfaceModalSpec, "key">,
): Extract<PageSurfaceSectionSpec, { kind: "modal" }> {
  return { kind: "modal", key, ...modal };
}

export function createPageSurfaceProps(options: PageSurfaceShellPropsOptions): PageSurfaceProps {
  const {
    kind,
    body,
    actions,
    empty,
    ...rest
  } = options;
  return {
    kind,
    body: body ?? (actions || empty ? createPageBody([], { commands: actions, empty }) : undefined),
    ...rest,
  } as PageSurfaceProps;
}
