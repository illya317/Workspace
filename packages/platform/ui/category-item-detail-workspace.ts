import {
  createEmptySection,
  createMasterDetailBody,
  createPageBody,
  createPanelSection,
  type BodySurfaceProps,
  type BodySurfaceSectionCreateSpec,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSelectionGridSpec,
  type MasterDetailBodyOptions,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";

export interface CategoryDirectItemSectionSpec {
  key: string;
  title: string;
  ariaLabel: string;
  options: DataSurfaceCellSelectionGridSpec["options"];
  value?: string | null;
  mode?: DataSurfaceCellSelectionGridSpec["mode"];
  columns?: DataSurfaceCellSelectionGridSpec["columns"];
  minItemWidth?: DataSurfaceCellSelectionGridSpec["minItemWidth"];
  emptyText?: string;
  create?: BodySurfaceSectionCreateSpec;
  sectionsAfterGrid?: BodySurfaceSectionSpec[];
  onSelect?: (value: string) => void;
  onItemClick?: DataSurfaceCellSelectionGridSpec["onItemClick"];
}

export interface CategoryItemDetailWorkspaceSpec<TCategory> {
  category: {
    label: string;
    selector: SelectorSurfaceProps<TCategory>;
    mobileSelector?: SelectorSurfaceProps<TCategory>;
    presentation?: MasterDetailBodyOptions["master"]["presentation"];
    footer?: MasterDetailBodyOptions["master"]["footer"];
  };
  directItems?: CategoryDirectItemSectionSpec | BodySurfaceSectionSpec;
  detailSections?: BodySurfaceSectionSpec[];
  desktop?: MasterDetailBodyOptions["desktop"];
  mobile?: MasterDetailBodyOptions["mobile"];
}

export function createCategoryDirectItemSection(
  spec: CategoryDirectItemSectionSpec,
): BodySurfaceSectionSpec {
  const sections = spec.options.length > 0
    ? [{
        key: `${spec.key}-grid`,
        body: {
          kind: "data" as const,
          data: {
            kind: "structured" as const,
            rows: [[{
              content: {
                kind: "selectionGrid" as const,
                mode: spec.mode ?? "select",
                layout: "fixed" as const,
                columns: spec.columns ?? 2,
                minItemWidth: spec.minItemWidth,
                value: spec.value,
                ariaLabel: spec.ariaLabel,
                options: spec.options,
                onChange: spec.onSelect,
                onItemClick: spec.onItemClick,
              },
            }]],
            frame: "plain" as const,
          },
        },
      }]
    : [createEmptySection(`${spec.key}-empty`, {
        presentation: "plain",
        compact: true,
        content: spec.emptyText ?? "当前分类暂无直属项",
      })];

  return createPanelSection(spec.key, {
    title: spec.title,
    create: spec.create,
    sections: [...sections, ...(spec.sectionsAfterGrid ?? [])],
  });
}

function isBodySurfaceSectionSpec(
  value: CategoryDirectItemSectionSpec | BodySurfaceSectionSpec,
): value is BodySurfaceSectionSpec {
  return "body" in value;
}

export function createCategoryItemDetailBody<TCategory>(
  spec: CategoryItemDetailWorkspaceSpec<TCategory>,
): BodySurfaceProps {
  return createMasterDetailBody({
    master: {
      label: spec.category.label,
      presentation: spec.category.presentation ?? "compact",
      footer: spec.category.footer,
      body: { kind: "selector", selector: spec.category.selector },
      mobileBody: spec.category.mobileSelector
        ? { kind: "selector", selector: spec.category.mobileSelector }
        : undefined,
    },
    detail: createPageBody([
      ...(spec.directItems
        ? [isBodySurfaceSectionSpec(spec.directItems)
            ? spec.directItems
            : createCategoryDirectItemSection(spec.directItems)]
        : []),
      ...(spec.detailSections ?? []),
    ]),
    desktop: spec.desktop ?? { ratio: [1, 2] },
    mobile: spec.mobile,
  });
}
