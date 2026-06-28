import type {
  CoreUiComponentCategory,
  CoreUiComponentSubcategory,
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
  CoreUiExposure,
} from "./component-registry-types";
import { core_internal_registry_entries } from "./component-registry-data-core-internal";
import { foundation_registry_entries } from "./component-registry-data-foundation";
import { foundation_extra_registry_entries } from "./component-registry-data-foundation-extra";
import { page_api_registry_entries as pageApiAM } from "./component-registry-data-page-api-a-m";
import { page_api_registry_entries as pageApiFH } from "./component-registry-data-page-api-f-h";
import { page_api_registry_entries as pageApiIM } from "./component-registry-data-page-api-i-m";
import { page_api_registry_entries as pageApiM } from "./component-registry-data-page-api-m";
import { page_api_registry_entries as pageApiNZ } from "./component-registry-data-page-api-n-z";
import { page_api_registry_entries as pageApiSZ } from "./component-registry-data-page-api-s-z";
import { page_frame_registry_entries } from "./component-registry-data-frame";

type CoreUiOwnershipFields = Required<
  Pick<
    CoreUiComponentRegistration,
    "category" | "subcategory"
  >
>;

type CoreUiOwnershipOverride = Partial<CoreUiOwnershipFields>;
type CoreUiExposureOverride = {
  exposure?: CoreUiExposure;
};

export const coreUiComponentRegistryRaw = [
  ...page_frame_registry_entries,
  ...pageApiAM,
  ...pageApiFH,
  ...pageApiIM,
  ...pageApiM,
  ...pageApiNZ,
  ...pageApiSZ,
  ...core_internal_registry_entries,
  ...foundation_registry_entries,
  ...foundation_extra_registry_entries,
] as const satisfies readonly CoreUiComponentRegistration[];

const OWNERSHIP_BY_NAME = {
  PageSurface: { subcategory: "page.surface" },
  DocumentSurface: { subcategory: "page.document" },
  PageShell: { subcategory: "page.frame" },
  PageContent: { subcategory: "page.frame" },
  DatabasePageFrame: { subcategory: "page.frame" },
  AnalysisPageFrame: { subcategory: "page.frame" },
  WorkspaceSplitPage: { subcategory: "page.frame" },
  SplitWorkspace: { subcategory: "page.frame" },
  PanelCard: { subcategory: "common.display" },
  SectionCard: { subcategory: "page.blocks" },
  ModuleCard: { subcategory: "page.blocks" },
  AnalysisBlock: { subcategory: "page.blocks" },
  EntityDetailLayout: { subcategory: "page.blocks" },

  DataSurface: { subcategory: "data.surface" },
  DataTable: { subcategory: "data.table" },
  TableScrollFrame: { subcategory: "data.table" },
  StructuredTable: { subcategory: "data.table" },
  DisclosureRecordCard: { subcategory: "data.record" },
  MetricCard: { subcategory: "data.metric" },
  MetricTile: { subcategory: "data.metric" },
  NumberCell: { subcategory: "data.cell" },
  AmountCell: { subcategory: "data.cell" },

  FormSurface: { subcategory: "form.surface" },
  FormShell: { subcategory: "form.surface" },
  FormField: { subcategory: "form.field" },
  FieldGrid: { subcategory: "form.layout" },
  FieldControl: { subcategory: "form.input-adapter" },
  InlineCreatePanel: { subcategory: "form.create" },
  BlockCreatePanel: { subcategory: "form.create" },
  CreatePanel: { subcategory: "form.create" },

  NavigationSurface: { subcategory: "common.chrome" },
  Toolbar: { subcategory: "common.chrome" },
  TabBar: { subcategory: "common.chrome" },
  Pagination: { subcategory: "common.chrome" },
  DisclosureSectionHeader: { subcategory: "common.chrome" },
  CommandButton: { subcategory: "common.action" },
  ActionButton: { subcategory: "common.action" },
  RefreshActionButton: { subcategory: "common.action" },
  CreateStartButton: { subcategory: "common.action" },
  CreateConfirmActions: { subcategory: "common.action" },
  ActionGlyph: { subcategory: "common.action" },
  ActionGlyphs: { subcategory: "common.action" },

  InputControl: { subcategory: "common.input" },
  TextField: { subcategory: "common.input" },
  TextareaField: { subcategory: "common.input" },
  SelectField: { subcategory: "common.input" },
  CalendarDateInput: { subcategory: "common.input" },
  TimeField: { subcategory: "common.input" },
  FileField: { subcategory: "common.input" },
  CheckboxField: { subcategory: "common.input" },
  CheckboxChip: { subcategory: "common.input" },
  SwitchField: { subcategory: "common.input" },
  PercentField: { subcategory: "common.input" },
  RatingControl: { subcategory: "common.input" },
  ChoiceGroup: { subcategory: "common.input" },
  SearchInput: { subcategory: "common.input" },
  AutoSizeTextField: { subcategory: "common.input" },
  FieldInputShell: { subcategory: "common.input" },
  FieldShell: { subcategory: "common.input" },
  ReadOnlyField: { subcategory: "common.input" },
  HiddenDataField: { subcategory: "common.input" },
  SegmentedCodeInput: { subcategory: "common.input" },
  TagListInput: { subcategory: "common.input" },
  TagStringInput: { subcategory: "common.input" },

  OptionPicker: { subcategory: "common.selection" },
  PickerShell: { subcategory: "common.selection" },
  PickerOptionButton: { subcategory: "common.selection" },
  SelectorPanel: { subcategory: "common.selection" },
  SelectorList: { subcategory: "common.selection" },
  SelectorTree: { subcategory: "common.selection" },
  SelectorCard: { subcategory: "common.selection" },
  TreeNodeBranch: { subcategory: "common.selection" },
  TreeNodeCard: { subcategory: "common.selection" },
  SelectionGrid: { subcategory: "common.selection" },
  FieldValueFilter: { subcategory: "common.selection" },
  FkFieldInput: { subcategory: "common.selection" },
  SearchableOptionInput: { subcategory: "common.selection" },

  Badge: { subcategory: "common.display" },
  EmptyStateCard: { subcategory: "common.display" },
  CodeBlock: { subcategory: "common.display" },

  DetailModal: { subcategory: "common.overlay" },
  DropdownMenu: { subcategory: "common.overlay" },
  DropdownSurface: { subcategory: "common.overlay" },
  ConfirmModal: { subcategory: "feedback.renderer" },
  FeedbackProvider: { subcategory: "feedback.renderer" },
  Toast: { subcategory: "feedback.renderer" },
  useFeedback: { subcategory: "feedback.service" },
} as const satisfies Record<string, CoreUiOwnershipOverride>;

const EXPOSURE_BY_NAME = {
  PageSurface: { exposure: { mode: "direct" } }, FormSurface: { exposure: { mode: "via", entry: "PageSurface", path: "body.blocks[].kind=form" } }, DataSurface: { exposure: { mode: "via", entry: "PageSurface", path: "body.blocks[].kind=data" } }, DocumentSurface: { exposure: { mode: "via", entry: "PageSurface", path: "body.blocks[].kind=document" } }, useFeedback: { exposure: { mode: "direct" } },
  InputControl: { exposure: { mode: "direct" } },
  TextField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=text" } },
  TextareaField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=text + spec.multiline=true" } },
  SelectField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=choice + spec.options.mode=dropdown" } },
  CalendarDateInput: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=temporal + spec.precision=date" } },
  TimeField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=temporal + spec.precision=time" } },
  FileField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=file" } },
  CheckboxField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=boolean + spec.presentation=checkbox" } },
  SwitchField: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=boolean + spec.presentation=switch" } },
  PercentField: { exposure: { mode: "via", entry: "InputControl", path: "spec.format=percent" } },
  RatingControl: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=rating" } },
  ReadOnlyField: { exposure: { mode: "via", entry: "InputControl", path: "spec.state=readonly" } },
  TagStringInput: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=collection + spec.itemControl=text" } },
  SegmentedCodeInput: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=text + spec.mask.kind=editableSegment" } },
  OptionPicker: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=choice + spec.options.source=static|grouped" } },
  SearchableOptionInput: { exposure: { mode: "via", entry: "InputControl", path: "spec.control=choice + spec.options.mode=autocomplete" } },
  FkFieldInput: { exposure: { mode: "via", entry: "InputControl", path: "spec.options.source=remote" } },

  Toolbar: { exposure: { mode: "via", entry: "PageSurface", path: "toolbar.items" } },
  ActionButton: { exposure: { mode: "via", entry: "PageSurface", path: "toolbar.items[].kind" } },
  CommandButton: { exposure: { mode: "via", entry: "PageSurface", path: "toolbar.items[].kind=text" } },
  SearchInput: { exposure: { mode: "via", entry: "PageSurface", path: "toolbar.items[].kind=search" } },
  FieldValueFilter: { exposure: { mode: "via", entry: "PageSurface", path: "toolbar.items[].kind=field-value-filter" } },
  TabBar: { exposure: { mode: "via", entry: "PageSurface", path: "navigation.kind=tabs" } },
  Pagination: { exposure: { mode: "via", entry: "PageSurface", path: "footer.pagination" } },
  NavigationSurface: { exposure: { mode: "via", entry: "PageSurface", path: "navigation" } },

  SelectorPanel: { exposure: { mode: "direct" } }, SelectorList: { exposure: { mode: "via", entry: "SelectorPanel", path: "mode=list" } }, SelectorTree: { exposure: { mode: "via", entry: "SelectorPanel", path: "mode=tree" } }, SelectorCard: { exposure: { mode: "via", entry: "SelectorPanel", path: "mode=list|tree item renderer" } }, SelectionGrid: { exposure: { mode: "via", entry: "SelectorPanel", path: "mode=grid" } },
  CreatePanel: { exposure: { mode: "direct" } }, InlineCreatePanel: { exposure: { mode: "via", entry: "CreatePanel", path: "variant=inline" } }, BlockCreatePanel: { exposure: { mode: "via", entry: "CreatePanel", path: "variant=block" } },
} as const satisfies Record<string, CoreUiExposureOverride>;

function defaultExposure(): CoreUiExposure {
  return { mode: "internal" };
}

function categoryForSubcategory(subcategory: CoreUiComponentSubcategory): CoreUiComponentCategory {
  return subcategory.slice(0, subcategory.indexOf(".")) as CoreUiComponentCategory;
}

function defaultSubcategory(registration: CoreUiComponentRegistration): CoreUiComponentSubcategory {
  const byName = OWNERSHIP_BY_NAME[registration.name as keyof typeof OWNERSHIP_BY_NAME]?.subcategory;
  if (byName) return byName;
  return registration.subcategory ?? "common.foundation";
}

function inferCoreUiOwnership(registration: CoreUiComponentRegistration): CoreUiOwnershipFields {
  const override: CoreUiOwnershipOverride = OWNERSHIP_BY_NAME[registration.name as keyof typeof OWNERSHIP_BY_NAME] ?? {};
  const subcategory = registration.subcategory ?? override.subcategory ?? defaultSubcategory(registration);
  return {
    category: registration.category ?? override.category ?? categoryForSubcategory(subcategory),
    subcategory,
  };
}

function enrichCoreUiComponentRegistration(
  registration: CoreUiComponentRegistration,
): CoreUiComponentRegistration {
  const ownership = inferCoreUiOwnership(registration);
  const withOwnership = {
    ...ownership,
    ...registration,
  };
  const exposure: CoreUiExposureOverride = EXPOSURE_BY_NAME[registration.name as keyof typeof EXPOSURE_BY_NAME] ?? {};
  return {
    ...withOwnership,
    exposure: registration.exposure ?? exposure.exposure ?? defaultExposure(),
  };
}

function buildCoreUiCompositionGraph(
  registrations: readonly CoreUiComponentRegistration[],
): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const registration of registrations) {
    const compositionTargets = registration.composes ?? [];

    composes.set(registration.name, compositionTargets);

    for (const target of compositionTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
  }

  const sortedUsedBy = new Map<string, readonly string[]>();
  for (const [name, list] of usedBy) {
    sortedUsedBy.set(name, [...new Set(list)].sort());
  }

  return { composes, usedBy: sortedUsedBy };
}

const coreUiComponentRegistryEnriched = coreUiComponentRegistryRaw.map(enrichCoreUiComponentRegistration);

const coreUiCompositionGraph = buildCoreUiCompositionGraph(coreUiComponentRegistryEnriched);

export const coreUiComponentRegistry: readonly CoreUiComponentRegistration[] = coreUiComponentRegistryEnriched;

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);

/**
 * 反向计算组合关系：由 composes 推导出每个 entry 被谁使用。
 * 注意：usedBy 不要手写，必须由 registry 反向计算，否则会和 composes 漂移。
 */
export function getCoreUiCompositionGraph(): CoreUiCompositionGraph {
  return coreUiCompositionGraph;
}
