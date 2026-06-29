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
import type {
  FormSurfaceItemSpec,
  FormSurfaceLayoutSpec,
  FormSurfaceLooseItem,
  FormSurfaceProps,
  FormSurfaceSubmitSpec,
} from "../FormSurface.types";
import type { MetricsSurfaceProps } from "../MetricsSurface";
import type { NavigationRendererTabsSpec } from "../NavigationRenderer";
import type {
  PageSurfaceBodySectionSpec,
  PageSurfaceBodySpec,
  PageSurfaceCommandSpec,
  PageSurfaceCompleteBodySpec,
  PageSurfaceEmptySpec,
  PageSurfaceKind,
  PageSurfaceModalSpec,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceSectionSpec,
  PageSurfaceSplitBodySpec,
  PageSurfaceToolbarSpec,
} from "../PageSurface.types";
import type { SelectorSurfaceProps } from "../SelectorSurface";
import { PageSurfaceSectionStack } from "../internal/page/PageSurface.sections";
import type { RecordSurfaceProps } from "../RecordSurface";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";

export type PageSurfaceNonModalSectionSpec = PageSurfaceSectionSpec;
export type PageSurfaceBodyInputSpec = PageSurfaceSectionSpec | PageSurfaceModalSpec;

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

export type TabbedPageBodyOptions = Omit<PageSurfaceCompleteBodySpec, "kind" | "sections" | "sectioning"> & {
  active: string;
  onChange?: (key: string) => void;
};

export type SplitPageBodyOptions = {
  selector: SelectorSurfaceProps;
  drawerSelector?: SelectorSurfaceProps;
  right: PageSurfaceCompleteBodySpec;
  side: {
    label: string;
    open: boolean;
    drawerOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onDrawerOpenChange: (open: boolean) => void;
    showControls?: boolean;
  };
  layout?: {
    ratio?: PageSurfaceSplitBodySpec["splitRatio"];
  };
};

export function createPageBody(
  sections: PageSurfaceBodyInputSpec[],
  options: Omit<PageSurfaceCompleteBodySpec, "kind" | "sections"> = {},
): PageSurfaceCompleteBodySpec & { sections: PageSurfaceSectionSpec[] } {
  const bodySections = sections.filter((section): section is PageSurfaceSectionSpec => "body" in section);
  const modals = sections.filter((section): section is PageSurfaceModalSpec => !("body" in section));
  return {
    kind: "complete",
    ...options,
    sections: bodySections,
    modals: [...(options.modals ?? []), ...modals],
  };
}

export function createSplitPageBody(options: SplitPageBodyOptions): PageSurfaceSplitBodySpec {
  return {
    kind: "split",
    selector: options.selector,
    drawerSelector: options.drawerSelector,
    right: options.right,
    sideLabel: options.side.label,
    sideOpen: options.side.open,
    drawerOpen: options.side.drawerOpen,
    onSideOpenChange: options.side.onOpenChange,
    onDrawerOpenChange: options.side.onDrawerOpenChange,
    showSideControls: options.side.showControls,
    splitRatio: options.layout?.ratio,
  };
}

export function createTabbedPageBody(
  sections: PageSurfaceBodyInputSpec[],
  options: TabbedPageBodyOptions,
): PageSurfaceCompleteBodySpec & { sections: PageSurfaceSectionSpec[] } {
  const { active, onChange, ...bodyOptions } = options;
  return createPageBody(sections, {
    ...bodyOptions,
    sectioning: { kind: "tabs", active, onChange },
  });
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
  tabs: NavigationRendererTabsSpec,
): PageSurfaceSectionSpec {
  return {
    key,
    body: {
      kind: "navigation",
      navigation: {
        kind: "tabs",
        tabs,
      },
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
): PageSurfaceSectionSpec {
  return createActionsSection(key, actions, options);
}

export function createPageDataSection<T>(
  key: string,
  surface: DataSurfaceProps<T>,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "data", data: surface as DataSurfaceProps } };
}

export function createMetricsSection(
  key: string,
  surface: MetricsSurfaceProps,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "metrics", metrics: surface } };
}

export function createRecordSection(
  key: string,
  surface: RecordSurfaceProps,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "record", record: surface } };
}

export function createPageTableSection<T>(
  key: string,
  table: Omit<DataSurfaceTableProps<T>, "kind">,
): PageSurfaceBodySectionSpec {
  return createPageDataSection<T>(key, { kind: "table", ...table });
}

export function createFormSection<T = FormSurfaceLooseItem>(
  key: string,
  surface: FormSurfaceProps<T>,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "form", form: surface as FormSurfaceProps } };
}

export function createFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "fields" | "detail";
    layout?: FormSurfaceLayoutSpec;
    commands?: FormSurfaceProps<T>["commands"];
    submit?: FormSurfaceSubmitSpec;
  } = {},
): PageSurfaceBodySectionSpec {
  const { kind = "fields", layout, commands, submit } = options;
  return createFormSection<T>(key, { kind, content: { items, layout }, commands, submit });
}

export function createInlineFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "filters";
    layout?: FormSurfaceLayoutSpec;
    commands?: FormSurfaceProps<T>["commands"];
    submit?: FormSurfaceSubmitSpec;
  } = {},
): PageSurfaceBodySectionSpec {
  return createFormSection<T>(key, {
    kind: "filters",
    content: { items, layout: { flow: "inline", ...options.layout } },
    commands: options.commands,
    submit: options.submit,
  });
}

export function createDocumentSection(
  key: string,
  surface: DocumentSurfaceProps,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "document", document: surface } };
}

export function createVisualizationSection(
  key: string,
  surface: VisualizationSurfaceProps,
): PageSurfaceBodySectionSpec {
  return { key, body: { kind: "visualization", visualization: surface } };
}

export function createBlockSurfaceSection(
  key: string,
  surface: BlockSurfaceProps,
): PageSurfaceSectionSpec {
  return { key, body: { kind: "section", surface } };
}

export function createMessageSection(
  key: string,
  message: Omit<BlockSurfaceMessageProps, "kind" | "key">,
): PageSurfaceSectionSpec {
  return createBlockSurfaceSection(key, { kind: "message", ...message });
}

export function createEmptySection(
  key: string,
  empty: Omit<BlockSurfaceEmptyProps, "kind" | "key">,
): PageSurfaceSectionSpec {
  return createBlockSurfaceSection(key, { kind: "empty", ...empty });
}

export function createActionsSection(
  key: string,
  actions: BlockSurfaceActionsProps["actions"],
  options: Omit<BlockSurfaceActionsProps, "kind" | "key" | "actions"> = {},
): PageSurfaceSectionSpec {
  return createBlockSurfaceSection(key, { kind: "actions", actions, ...options });
}

export function createHeadingSection(
  key: string,
  heading: Omit<BlockSurfaceHeadingProps, "kind" | "key">,
): PageSurfaceSectionSpec {
  return createBlockSurfaceSection(key, { kind: "heading", ...heading });
}

export function createSectionsSection(
  key: string,
  group: Omit<BlockSurfaceGroupProps, "kind" | "key" | "blocks"> & NestedPageSections,
): PageSurfaceSectionSpec {
  const { layout = "stack", sections } = group;
  return { key, body: { kind: "section", layout, sections } };
}

function nestedSectionContent(sections?: PageSurfaceSectionSpec[], layout?: "stack" | "grid") {
  return sections?.length ? createElement(PageSurfaceSectionStack, { sections, layout }) : undefined;
}

export function createPanelSection(
  key: string,
  panel: PageSectionPanelOptions,
): PageSurfaceSectionSpec {
  const { actions, framed, layout = "stack", sections, subtitle, title } = panel;
  return {
    key,
    label: title,
    framed,
    header: { title, subtitle, actions },
    body: { kind: "section", layout, sections },
  };
}

export function createAnalysisSection(
  key: string,
  analysis: PageSectionAnalysisOptions,
): PageSurfaceSectionSpec {
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
): PageSurfaceSectionSpec {
  return createPanelSection(key, section);
}

export function createModuleGridSection(
  key: string,
  moduleGrid: Omit<BlockSurfaceModuleGridProps, "kind" | "key">,
): PageSurfaceSectionSpec {
  return createBlockSurfaceSection(key, { kind: "moduleGrid", ...moduleGrid });
}

export function createPageModalSection(
  key: string,
  modal: Omit<PageSurfaceModalSpec, "key">,
): PageSurfaceModalSpec {
  return { key, ...modal };
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
