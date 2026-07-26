import type { ReactNode, Ref } from "react";
import type { DataSurfaceProps, DataSurfaceRecordProps, DataSurfaceSummaryProps, DataSurfaceTableProps } from "../DataSurface.types";
import type { DocumentSurfaceProps } from "../DocumentSurface";
import type {
  FormSurfaceItemSpec,
  FormSurfaceActionSpec,
  FormSurfaceCommandSpec,
  FormSurfaceFilterLayoutSpec,
  FormSurfaceHeaderSpec,
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
  BodySurfaceSectionCreateSpec,
  BodySurfaceSectionDisclosureSpec,
  BodySurfaceSplitMasterPresentation,
  BodySurfaceSplitSectionProps,
  BodySurfaceStatusSpec,
  BodySurfaceSectionSpec,
  BodySurfaceProps,
} from "../BodySurface";
import type { PageSurfaceTabBarSpec } from "../PageSurface.types";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";

export type BodySurfaceBodyInputSpec = BodySurfaceSectionSpec | BodySurfaceModalSpec;

type NestedPageSections = {
  sections: BodySurfaceSectionSpec[];
  layout?: "stack" | "grid";
  gridColumns?: 2 | 3;
  mobilePresentation?: "stack" | "drilldown";
};

type PageSectionPanelOptions = NestedPageSections & {
  title?: ReactNode;
  actions?: BodySurfaceCommandSpec[];
  create?: BodySurfaceSectionCreateSpec;
  disclosure?: BodySurfaceSectionDisclosureSpec;
  itemRef?: Ref<HTMLDivElement>;
};

type PageSectionCardOptions = PageSectionPanelOptions & {
  title: NonNullable<PageSectionPanelOptions["title"]>;
};

type PageSectionAnalysisOptions = NestedPageSections & {
  title: NonNullable<PageSectionPanelOptions["title"]>;
  actions?: BodySurfaceCommandSpec[];
};

export type MasterDetailBodyOptions = {
  master: {
    label: string;
    body: BodySurfaceProps;
    mobileBody?: BodySurfaceProps;
    presentation?: BodySurfaceSplitMasterPresentation;
  };
  detail: BodySurfaceProps;
  desktop?: {
    presentation?: "ratio" | "fixed-sidebar";
    ratio?: readonly [number, number];
  };
  mobile?: {
    detailActive?: boolean;
    onNavigateToList?: () => void;
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

export function createMasterDetailBody(options: MasterDetailBodyOptions): BodySurfaceSplitSectionProps {
  return {
    kind: "section",
    layout: "split",
    master: options.master,
    detail: options.detail,
    desktop: options.desktop,
    mobile: options.mobile,
  };
}

export function createPageTabBar(
  tabbar: Omit<Extract<PageSurfaceTabBarSpec, { kind: "tabs" }>, "kind">,
): PageSurfaceTabBarSpec {
  return {
    kind: "tabs",
    ...tabbar,
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
  options: { itemRef?: Ref<HTMLDivElement> } = {},
): BodySurfaceSectionSpec {
  return { key, itemRef: options.itemRef, body: { kind: "form", form: surface as FormSurfaceProps } };
}

export function createFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "fields" | "detail";
    layout?: FormSurfaceLayoutSpec;
    header?: FormSurfaceHeaderSpec;
    actions?: FormSurfaceActionSpec[];
    submit?: FormSurfaceSubmitSpec;
    itemRef?: Ref<HTMLDivElement>;
  } = {},
): BodySurfaceSectionSpec {
  const { itemRef, kind = "fields", layout, header, actions, submit } = options;
  return createFormSection<T>(key, { kind, content: { items, layout }, header, actions, submit }, { itemRef });
}

export function createInlineFieldsSection<T = FormSurfaceLooseItem>(
  key: string,
  items: FormSurfaceItemSpec<T>[],
  options: {
    kind?: "filters";
    layout?: FormSurfaceFilterLayoutSpec;
    header?: FormSurfaceHeaderSpec;
    actions?: FormSurfaceActionSpec[];
    commands?: FormSurfaceCommandSpec[];
    submit?: FormSurfaceSubmitSpec;
    itemRef?: Ref<HTMLDivElement>;
  } = {},
): BodySurfaceSectionSpec {
  return createFormSection<T>(key, {
    kind: "filters",
    content: { items, layout: { flow: "inline", ...options.layout } },
    header: options.header,
    actions: options.actions,
    commands: options.commands,
    submit: options.submit,
  }, { itemRef: options.itemRef });
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
  heading: { title: ReactNode; level?: 1 | 2 | 3 },
): BodySurfaceSectionSpec {
  const { title } = heading;
  return { key, header: { title }, body: { kind: "section" } };
}

export function createSectionsSection(
  key: string,
  group: NestedPageSections,
): BodySurfaceSectionSpec {
  const { gridColumns, layout = "stack", mobilePresentation, sections } = group;
  return { key, body: { kind: "section", layout, gridColumns, mobilePresentation, sections } };
}

export function createPanelSection(
  key: string,
  panel: PageSectionPanelOptions,
): BodySurfaceSectionSpec {
  const { actions, create, disclosure, gridColumns, itemRef, layout = "stack", mobilePresentation, sections, title } = panel;
  return {
    key,
    label: title,
    disclosure,
    itemRef,
    header: { title, actions, create },
    body: { kind: "section", layout, gridColumns, mobilePresentation, sections },
  };
}

export function createAnalysisSection(
  key: string,
  analysis: PageSectionAnalysisOptions,
): BodySurfaceSectionSpec {
  const { actions, layout = "stack", mobilePresentation, sections, title } = analysis;
  return {
    key,
    label: title,
    header: { title, actions },
    body: { kind: "section", layout, mobilePresentation, sections },
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
  return {
    key,
    ...modal,
    sections: modal.sections,
  };
}
