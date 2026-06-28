import { createElement, type Ref } from "react";
import type { DataSurfaceProps, DataSurfaceTableProps } from "../surface/DataSurface.types";
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
import type { DocumentSurfaceProps } from "../DocumentSurface";
import type { FormSurfaceFieldModeProps, FormSurfaceLooseItem, FormSurfaceProps } from "../surface/FormSurface.types";
import type {
  PageSurfaceBlockSpec,
  PageSurfaceBodySpec,
  PageSurfaceCommandSpec,
  PageSurfaceEmptySpec,
  PageSurfaceHeaderSpec,
  PageSurfaceKind,
  PageSurfaceModalSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceToolbarSpec,
} from "../surface/PageSurface.types";
import { PageSurfaceBlockGroupStack, PageSurfaceBlockStack } from "../PageSurface.blocks";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";

export type PageSurfaceBodyBlockSpec = Exclude<PageSurfaceBlockSpec, { kind: "modal" }>;

type NestedPageBlocks = {
  blocks: PageSurfaceBlockSpec[];
};

type PageBlockPanelOptions = Omit<BlockSurfacePanelProps, "kind" | "key" | "content" | "blocks"> & NestedPageBlocks & {
  itemRef?: Ref<HTMLDivElement>;
};

type PageBlockSectionOptions = PageBlockPanelOptions & {
  title: NonNullable<BlockSurfacePanelProps["title"]>;
};

type PageBlockAnalysisOptions = Omit<BlockSurfaceAnalysisProps, "kind" | "key" | "content" | "toolbarItems"> & NestedPageBlocks & {
  toolbar?: PageSurfaceToolbarSpec;
};

export interface PageSurfaceShellPropsOptions {
  kind?: Exclude<PageSurfaceKind, "split">;
  title?: PageSurfaceHeaderSpec["title"];
  backHref?: string;
  backLabel?: PageSurfaceHeaderSpec["backLabel"];
  header?: PageSurfaceHeaderSpec;
  /** @deprecated Use body.blocks. */
  blocks?: PageSurfaceBlockSpec[];
  body?: PageSurfaceBodySpec;
  toolbar?: PageSurfaceProps["toolbar"];
  navigation?: PageSurfaceProps["navigation"];
  footer?: PageSurfaceProps["footer"];
  actions?: PageSurfaceCommandSpec[];
  empty?: PageSurfaceEmptySpec;
  embedded?: boolean;
  className?: string;
  contentClassName?: string;
}

export function createPageBody(
  blocks: PageSurfaceBlockSpec[],
  options: Omit<PageSurfaceBodySpec, "blocks"> = {},
): PageSurfaceBodySpec {
  return { ...options, blocks };
}

export function createPageTabsNavigation({
  level = 1,
  className,
  ...navigation
}: Omit<PageSurfaceNavigationSpec, "kind" | "level"> & {
  level?: PageSurfaceNavigationSpec["level"];
}): PageSurfaceNavigationSpec {
  return {
    kind: "tabs",
    level,
    className,
    ...navigation,
  };
}

export function createPageCommand(command: PageSurfaceCommandSpec): PageSurfaceCommandSpec {
  return command;
}

export function createPageActionsBlock(
  key: string,
  actions: BlockSurfaceCommandSpec[],
  options: Omit<BlockSurfaceActionsProps, "kind" | "key" | "actions"> = {},
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createActionsBlock(key, actions, options);
}

export function createPageDataBlock<T>(
  key: string,
  surface: DataSurfaceProps<T>,
): Extract<PageSurfaceBlockSpec, { kind: "data" }> {
  return { kind: "data", key, surface };
}

export function createPageTableBlock<T>(
  key: string,
  table: Omit<DataSurfaceTableProps<T>, "kind">,
): Extract<PageSurfaceBlockSpec, { kind: "data" }> {
  return createPageDataBlock<T>(key, { kind: "table", ...table });
}

export function createFormBlock<T = FormSurfaceLooseItem>(
  key: string,
  surface: FormSurfaceProps<T>,
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  return { kind: "form", key, surface };
}

export function createFieldsBlock<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "fields" | "detail" } = {},
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  const { kind = "fields", ...rest } = options;
  return createFormBlock<T>(key, { kind, fields, ...rest });
}

export function createInlineFieldsBlock<T = FormSurfaceLooseItem>(
  key: string,
  fields: FormSurfaceFieldModeProps<T>["fields"],
  options: Omit<FormSurfaceFieldModeProps<T>, "kind" | "fields"> & { kind?: "inline" | "filters" } = {},
): Extract<PageSurfaceBlockSpec, { kind: "form" }> {
  const { kind = "inline", ...rest } = options;
  return createFormBlock<T>(key, { kind, fields, ...rest });
}

export function createDocumentBlock(
  key: string,
  surface: DocumentSurfaceProps,
): Extract<PageSurfaceBlockSpec, { kind: "document" }> {
  return { kind: "document", key, surface };
}

export function createVisualizationBlock(
  key: string,
  surface: VisualizationSurfaceProps,
): Extract<PageSurfaceBlockSpec, { kind: "visualization" }> {
  return { kind: "visualization", key, surface };
}

export function createBlockSurfaceBlock(
  key: string,
  surface: BlockSurfaceProps,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return { kind: "block", key, surface };
}

export function createMessageBlock(
  key: string,
  message: Omit<BlockSurfaceMessageProps, "kind" | "key">,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createBlockSurfaceBlock(key, { kind: "message", ...message });
}

export function createEmptyBlock(
  key: string,
  empty: Omit<BlockSurfaceEmptyProps, "kind" | "key">,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createBlockSurfaceBlock(key, { kind: "empty", ...empty });
}

export function createActionsBlock(
  key: string,
  actions: BlockSurfaceActionsProps["actions"],
  options: Omit<BlockSurfaceActionsProps, "kind" | "key" | "actions"> = {},
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createBlockSurfaceBlock(key, { kind: "actions", actions, ...options });
}

export function createHeadingBlock(
  key: string,
  heading: Omit<BlockSurfaceHeadingProps, "kind" | "key">,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createBlockSurfaceBlock(key, { kind: "heading", ...heading });
}

export function createGroupBlock(
  key: string,
  group: Omit<BlockSurfaceGroupProps, "kind" | "key" | "blocks"> & { blocks: PageSurfaceBlockSpec[] },
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  const { blocks, layout, className } = group;
  return createBlockSurfaceBlock(key, {
    kind: "content",
    className,
    content: createElement(PageSurfaceBlockGroupStack, {
      blocks,
      layout,
    }),
  });
}

function nestedBlockContent(blocks?: PageSurfaceBlockSpec[]) {
  return blocks?.length ? createElement(PageSurfaceBlockStack, { blocks }) : undefined;
}

export function createPanelBlock(
  key: string,
  panel: PageBlockPanelOptions,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  const { blocks, ...rest } = panel;
  return createBlockSurfaceBlock(key, {
    kind: "panel",
    ...(rest as Omit<BlockSurfacePanelProps, "kind" | "key">),
    content: nestedBlockContent(blocks),
  });
}

export function createAnalysisBlock(
  key: string,
  analysis: PageBlockAnalysisOptions,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  const { blocks, toolbar, ...rest } = analysis;
  return createBlockSurfaceBlock(key, {
    kind: "analysis",
    ...(rest as Omit<BlockSurfaceAnalysisProps, "kind" | "key">),
    toolbarItems: toolbar?.items,
    content: nestedBlockContent(blocks),
  });
}

export function createSectionBlock(
  key: string,
  section: PageBlockSectionOptions,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  const { blocks, ...rest } = section;
  return createBlockSurfaceBlock(key, {
    kind: "section",
    ...(rest as Omit<BlockSurfacePanelProps, "kind" | "key">),
    content: nestedBlockContent(blocks),
  });
}

export function createModuleGridBlock(
  key: string,
  moduleGrid: Omit<BlockSurfaceModuleGridProps, "kind" | "key">,
): Extract<PageSurfaceBlockSpec, { kind: "block" }> {
  return createBlockSurfaceBlock(key, { kind: "moduleGrid", ...moduleGrid });
}

export function createPageModalBlock(
  key: string,
  modal: Omit<PageSurfaceModalSpec, "key">,
): Extract<PageSurfaceBlockSpec, { kind: "modal" }> {
  return { kind: "modal", key, ...modal };
}

export function createPageSurfaceProps(options: PageSurfaceShellPropsOptions): PageSurfaceProps {
  const {
    kind = "list",
    title,
    backHref,
    backLabel,
    header,
    blocks,
    body,
    actions,
    empty,
    ...rest
  } = options;
  const resolvedBody = body ?? (blocks || actions || empty ? { blocks, commands: actions, empty } : undefined);
  return {
    kind,
    header: header ?? (title || backHref ? { title, backHref, backLabel } : undefined),
    body: resolvedBody,
    ...rest,
  } as PageSurfaceProps;
}
