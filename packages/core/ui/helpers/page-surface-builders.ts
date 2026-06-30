import type { ReactNode, Ref } from "react";
import type { DataSurfaceProps, DataSurfaceRecordProps, DataSurfaceSummaryProps, DataSurfaceTableProps } from "../DataSurface.types";
import type { DocumentSurfaceProps } from "../DocumentSurface";
import type {
  FormSurfaceItemSpec,
  FormSurfaceLayoutSpec,
  FormSurfaceLooseItem,
  FormSurfaceProps,
  FormSurfaceSubmitSpec,
} from "../FormSurface.types";
import type {
  BodySurfaceCommandSpec,
  BodySurfaceComposedSectionProps,
  BodySurfaceEmptySpec,
  BodySurfaceMessageSpec,
  BodySurfaceModalSpec,
  BodySurfaceListSpec,
  BodySurfaceModuleGridSpec,
  BodySurfaceSectionChrome,
  BodySurfaceStatusSpec,
  BodySurfaceSectionSpec,
  BodySurfaceProps,
  BodySurfaceSelectorProps,
} from "../BodySurface";
import type {
  PageSurfaceKind,
  PageSurfaceNavigationSpec,
  PageSurfaceProps,
  PageSurfaceToolbarSpec,
} from "../PageSurface.types";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";

export type BodySurfaceBodyInputSpec = BodySurfaceSectionSpec | BodySurfaceModalSpec;

type NestedPageSections = {
  sections: BodySurfaceSectionSpec[];
  layout?: "stack" | "grid";
  gridColumns?: 2 | 3;
};

type PageSectionPanelOptions = NestedPageSections & {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: BodySurfaceCommandSpec[];
  chrome?: BodySurfaceSectionChrome;
  framed?: boolean;
  itemRef?: Ref<HTMLDivElement>;
  autoReveal?: boolean;
};

type PageSectionCardOptions = PageSectionPanelOptions & {
  title: NonNullable<PageSectionPanelOptions["title"]>;
};

type PageSectionAnalysisOptions = NestedPageSections & {
  title: NonNullable<PageSectionPanelOptions["title"]>;
  subtitle?: PageSectionPanelOptions["subtitle"];
  actions?: BodySurfaceCommandSpec[];
  toolbar?: PageSurfaceToolbarSpec;
  chrome?: BodySurfaceSectionChrome;
  framed?: boolean;
};

export interface PageSurfaceShellPropsOptions {
  kind: PageSurfaceKind;
  body?: BodySurfaceProps;
  toolbar?: PageSurfaceProps["toolbar"];
  navigation?: PageSurfaceProps["navigation"];
  footer?: PageSurfaceProps["footer"];
  actions?: BodySurfaceCommandSpec[];
  empty?: BodySurfaceEmptySpec;
  embedded?: boolean;
}

export type TabbedPageBodyOptions = Omit<BodySurfaceComposedSectionProps, "kind" | "sections" | "sectioning"> & {
  active: string;
  onChange?: (key: string) => void;
};

export type BodySplitSectionOptions = {
  left: BodySurfaceSelectorProps;
  drawerLeft?: BodySurfaceSelectorProps;
  right: BodySurfaceProps;
  side: {
    label: string;
    open: boolean;
    drawerOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onDrawerOpenChange: (open: boolean) => void;
    showControls?: boolean;
  };
  layout?: {
    ratio?: readonly [number, number];
  };
};

export function createPageBody(
  sections: BodySurfaceBodyInputSpec[],
  options: Omit<BodySurfaceComposedSectionProps, "kind" | "sections"> = {},
): BodySurfaceProps & { kind: "section"; sections: BodySurfaceSectionSpec[] } {
  const bodySections = sections.filter((section): section is BodySurfaceSectionSpec => "body" in section);
  const modals = sections.filter((section): section is BodySurfaceModalSpec => !("body" in section));
  return {
    kind: "section",
    ...options,
    sections: bodySections,
    modals: [...(options.modals ?? []), ...modals],
  };
}

export function createBodySplitSection(options: BodySplitSectionOptions): BodySurfaceProps {
  return {
    kind: "section",
    layout: "split",
    left: options.left,
    drawerLeft: options.drawerLeft,
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
  sections: BodySurfaceBodyInputSpec[],
  options: TabbedPageBodyOptions,
): BodySurfaceProps & { kind: "section"; sections: BodySurfaceSectionSpec[] } {
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

export function createPageCommand(command: BodySurfaceCommandSpec): BodySurfaceCommandSpec {
  return command;
}

export function createPageActionsSection(
  key: string,
  actions: BodySurfaceCommandSpec[],
  options: Record<string, never> = {},
): BodySurfaceSectionSpec {
  return createActionsSection(key, actions, options);
}

export function createPageDataSection<T>(
  key: string,
  surface: DataSurfaceProps<T>,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "data", data: surface as DataSurfaceProps } };
}

export function createMetricsSection(
  key: string,
  surface: Omit<DataSurfaceSummaryProps, "kind">,
): BodySurfaceSectionSpec {
  return createPageDataSection(key, { kind: "summary", ...surface });
}

export function createRecordSection(
  key: string,
  surface: Omit<DataSurfaceRecordProps, "kind">,
): BodySurfaceSectionSpec {
  return createPageDataSection(key, { kind: "record", ...surface });
}

export function createPageTableSection<T>(
  key: string,
  table: Omit<DataSurfaceTableProps<T>, "kind">,
): BodySurfaceSectionSpec {
  return createPageDataSection<T>(key, { kind: "table", ...table });
}

export function createFormSection<T = FormSurfaceLooseItem>(
  key: string,
  surface: FormSurfaceProps<T>,
  options: { itemRef?: Ref<HTMLDivElement>; autoReveal?: boolean } = {},
): BodySurfaceSectionSpec {
  return { key, itemRef: options.itemRef, autoReveal: options.autoReveal, body: { kind: "form", form: surface as FormSurfaceProps } };
}

export function createFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "fields" | "detail";
    layout?: FormSurfaceLayoutSpec;
    commands?: FormSurfaceProps<T>["commands"];
    submit?: FormSurfaceSubmitSpec;
    itemRef?: Ref<HTMLDivElement>;
    autoReveal?: boolean;
  } = {},
): BodySurfaceSectionSpec {
  const { autoReveal, itemRef, kind = "fields", layout, commands, submit } = options;
  return createFormSection<T>(key, { kind, content: { items, layout }, commands, submit }, { autoReveal, itemRef });
}

export function createInlineFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "filters";
    layout?: FormSurfaceLayoutSpec;
    commands?: FormSurfaceProps<T>["commands"];
    submit?: FormSurfaceSubmitSpec;
    itemRef?: Ref<HTMLDivElement>;
    autoReveal?: boolean;
  } = {},
): BodySurfaceSectionSpec {
  return createFormSection<T>(key, {
    kind: "filters",
    content: { items, layout: { flow: "inline", ...options.layout } },
    commands: options.commands,
    submit: options.submit,
  }, { autoReveal: options.autoReveal, itemRef: options.itemRef });
}

export function createDocumentSection(
  key: string,
  surface: DocumentSurfaceProps,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "document", document: surface } };
}

export function createVisualizationSection(
  key: string,
  surface: VisualizationSurfaceProps,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "visualization", visualization: surface } };
}

export function createMessageSection(
  key: string,
  message: BodySurfaceMessageSpec,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", message } };
}

export function createEmptySection(
  key: string,
  empty: BodySurfaceEmptySpec,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", empty } };
}

export function createStatusSection(
  key: string,
  status: BodySurfaceStatusSpec,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", status } };
}

export function createListSection(
  key: string,
  list: BodySurfaceListSpec,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", list } };
}

export function createActionsSection(
  key: string,
  actions: BodySurfaceCommandSpec[],
  options: Record<string, never> = {},
): BodySurfaceSectionSpec {
  void options;
  return { key, body: { kind: "section", commands: actions } };
}

export function createHeadingSection(
  key: string,
  heading: { title: ReactNode; subtitle?: ReactNode; level?: 1 | 2 | 3 },
): BodySurfaceSectionSpec {
  const { title, subtitle } = heading;
  return { key, header: { title, subtitle }, body: { kind: "section" } };
}

export function createSectionsSection(
  key: string,
  group: NestedPageSections,
): BodySurfaceSectionSpec {
  const { gridColumns, layout = "stack", sections } = group;
  return { key, body: { kind: "section", layout, gridColumns, sections } };
}

export function createPanelSection(
  key: string,
  panel: PageSectionPanelOptions,
): BodySurfaceSectionSpec {
  const { actions, autoReveal, chrome, framed, gridColumns, itemRef, layout = "stack", sections, subtitle, title } = panel;
  return {
    key,
    label: title,
    chrome,
    framed,
    itemRef,
    autoReveal,
    header: { title, subtitle, actions },
    body: { kind: "section", layout, gridColumns, sections },
  };
}

export function createAnalysisSection(
  key: string,
  analysis: PageSectionAnalysisOptions,
): BodySurfaceSectionSpec {
  const { actions, chrome, framed, layout = "stack", sections, subtitle, title, toolbar } = analysis;
  return {
    key,
    label: title,
    chrome,
    framed,
    header: { title, subtitle, actions, toolbarItems: toolbar?.items },
    body: { kind: "section", layout, sections },
  };
}

export function createSectionSection(
  key: string,
  section: PageSectionCardOptions,
): BodySurfaceSectionSpec {
  return createPanelSection(key, section);
}

export function createModuleGridSection(
  key: string,
  moduleGrid: BodySurfaceModuleGridSpec,
): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", moduleGrid } };
}

export function createPageModalSection(
  key: string,
  modal: Omit<BodySurfaceModalSpec, "key">,
): BodySurfaceModalSpec {
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
