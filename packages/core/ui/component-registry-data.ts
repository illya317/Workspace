import type {
  CoreUiComponentOwnerL1,
  CoreUiComponentOwnerL2,
  CoreUiComponentPublicUse,
  CoreUiComponentRegistration,
  CoreUiComponentRole,
  CoreUiCompositionGraph,
} from "./component-registry-types";
import { core_internal_registry_entries } from "./component-registry-data-core-internal";
import { foundation_registry_entries } from "./component-registry-data-foundation";
import { page_api_registry_entries as pageApiAM } from "./component-registry-data-page-api-a-m";
import { page_api_registry_entries as pageApiM } from "./component-registry-data-page-api-m";
import { page_api_registry_entries as pageApiNZ } from "./component-registry-data-page-api-n-z";
import { page_frame_registry_entries } from "./component-registry-data-frame";

type CoreUiOwnershipFields = Required<
  Pick<
    CoreUiComponentRegistration,
    "ownerL1" | "ownerL2" | "role" | "publicUse"
  >
>;

type CoreUiOwnershipOverride = Partial<CoreUiOwnershipFields>;

export const coreUiComponentRegistryRaw = [
  ...page_frame_registry_entries,
  ...pageApiAM,
  ...pageApiM,
  ...pageApiNZ,
  ...core_internal_registry_entries,
  ...foundation_registry_entries,
] as const satisfies readonly CoreUiComponentRegistration[];

const OWNER_BY_NAME = {
  PageSurface: { ownerL2: "page.surface", role: "entry", publicUse: "business" },
  DocumentSurface: { ownerL2: "page.document", role: "renderer" },
  PageShell: { ownerL2: "page.frame", role: "renderer" },
  PageContent: { ownerL2: "page.frame", role: "renderer" },
  DatabasePageFrame: { ownerL2: "page.frame", role: "renderer" },
  AnalysisPageFrame: { ownerL2: "page.frame", role: "renderer" },
  WorkspaceSplitPage: { ownerL2: "page.frame", role: "renderer" },
  SplitWorkspace: { ownerL2: "page.frame", role: "renderer" },
  PanelCard: { ownerL2: "page.blocks", role: "renderer" },
  SectionCard: { ownerL2: "page.blocks", role: "renderer" },
  ModuleCard: { ownerL2: "page.blocks", role: "renderer" },
  AnalysisBlock: { ownerL2: "page.blocks", role: "renderer" },
  EntityDetailLayout: { ownerL2: "page.blocks", role: "renderer" },

  DataSurface: { ownerL2: "data.surface", role: "entry", publicUse: "business" },
  DataTable: { ownerL2: "data.table", role: "renderer" },
  TableScrollFrame: { ownerL2: "data.table", role: "renderer" },
  StructuredTable: { ownerL2: "data.table", role: "renderer" },
  DisclosureRecordCard: { ownerL2: "data.record", role: "renderer" },
  MetricCard: { ownerL2: "data.metric", role: "renderer" },
  MetricTile: { ownerL2: "data.metric", role: "renderer" },
  NumberCell: { ownerL2: "data.cell", role: "primitive" },
  AmountCell: { ownerL2: "data.cell", role: "primitive" },

  FormSurface: { ownerL2: "form.surface", role: "entry", publicUse: "business" },
  FormShell: { ownerL2: "form.surface", role: "renderer" },
  FormField: { ownerL2: "form.field", role: "renderer" },
  FieldGrid: { ownerL2: "form.layout", role: "renderer" },
  FieldControl: { ownerL2: "form.input-adapter", role: "renderer" },
  InlineCreatePanel: { ownerL2: "form.create", role: "renderer" },
  BlockCreatePanel: { ownerL2: "form.create", role: "renderer" },
  ModalCreatePanel: { ownerL2: "form.create", role: "renderer" },
  DetailCreatePanel: { ownerL2: "form.create", role: "renderer" },

  NavigationSurface: { ownerL2: "common.chrome", role: "renderer" },
  Toolbar: { ownerL2: "common.chrome", role: "renderer" },
  TabBar: { ownerL2: "common.chrome", role: "renderer" },
  Pagination: { ownerL2: "common.chrome", role: "renderer" },
  DisclosureSectionHeader: { ownerL2: "common.chrome", role: "renderer" },
  CommandButton: { ownerL2: "common.action", role: "renderer" },
  ActionButton: { ownerL2: "common.action", role: "primitive" },
  RefreshActionButton: { ownerL2: "common.action", role: "primitive" },
  CreateStartButton: { ownerL2: "common.action", role: "primitive" },
  CreateConfirmActions: { ownerL2: "common.action", role: "renderer" },
  ActionGlyph: { ownerL2: "common.action", role: "primitive" },
  ActionGlyphs: { ownerL2: "common.action", role: "primitive" },

  InputControl: { ownerL2: "common.input", role: "renderer" },
  TextField: { ownerL2: "common.input", role: "primitive" },
  TextareaField: { ownerL2: "common.input", role: "primitive" },
  SelectField: { ownerL2: "common.input", role: "primitive" },
  CalendarDateInput: { ownerL2: "common.input", role: "primitive" },
  TimeField: { ownerL2: "common.input", role: "primitive" },
  FileField: { ownerL2: "common.input", role: "primitive" },
  CheckboxField: { ownerL2: "common.input", role: "primitive" },
  CheckboxChip: { ownerL2: "common.input", role: "primitive" },
  SwitchField: { ownerL2: "common.input", role: "primitive" },
  PercentField: { ownerL2: "common.input", role: "primitive" },
  RatingControl: { ownerL2: "common.input", role: "primitive" },
  ChoiceGroup: { ownerL2: "common.input", role: "primitive" },
  SearchInput: { ownerL2: "common.input", role: "primitive" },
  AutoSizeTextField: { ownerL2: "common.input", role: "primitive" },
  FieldInputShell: { ownerL2: "common.input", role: "primitive" },
  FieldShell: { ownerL2: "common.input", role: "primitive" },
  ReadOnlyField: { ownerL2: "common.input", role: "primitive" },
  HiddenDataField: { ownerL2: "common.input", role: "primitive" },
  SegmentedCodeInput: { ownerL2: "common.input", role: "primitive" },
  TagListInput: { ownerL2: "common.input", role: "renderer" },
  TagStringInput: { ownerL2: "common.input", role: "renderer" },

  OptionPicker: { ownerL2: "common.selection", role: "renderer" },
  PickerShell: { ownerL2: "common.selection", role: "primitive" },
  PickerOptionButton: { ownerL2: "common.selection", role: "primitive" },
  SelectorPanel: { ownerL2: "common.selection", role: "renderer" },
  SelectorList: { ownerL2: "common.selection", role: "primitive" },
  SelectorTree: { ownerL2: "common.selection", role: "primitive" },
  SelectorCard: { ownerL2: "common.selection", role: "primitive" },
  SelectionGrid: { ownerL2: "common.selection", role: "renderer" },
  FieldValueFilter: { ownerL2: "common.selection", role: "renderer" },
  FkFieldInput: { ownerL2: "common.selection", role: "renderer" },
  SearchableOptionInput: { ownerL2: "common.selection", role: "renderer" },

  Badge: { ownerL2: "common.display", role: "primitive" },
  EmptyStateCard: { ownerL2: "common.display", role: "renderer" },
  CodeBlock: { ownerL2: "common.display", role: "renderer" },

  DetailModal: { ownerL2: "common.overlay", role: "renderer" },
  DropdownMenu: { ownerL2: "common.overlay", role: "renderer" },
  DropdownSurface: { ownerL2: "common.overlay", role: "primitive" },
  ConfirmModal: { ownerL2: "feedback.renderer", role: "renderer" },
  ConfirmProvider: { ownerL2: "feedback.compat", role: "renderer", publicUse: "compat" },
  FeedbackProvider: { ownerL2: "feedback.renderer", role: "renderer" },
  Toast: { ownerL2: "feedback.renderer", role: "renderer" },
  useFeedback: { ownerL2: "feedback.service", role: "entry", publicUse: "business" },
  useConfirm: { ownerL2: "feedback.compat", role: "renderer", publicUse: "compat" },
  useConfirmDelete: { ownerL2: "feedback.compat", role: "renderer", publicUse: "compat" },
  useUnsavedChangesPrompt: { ownerL2: "feedback.compat", role: "renderer", publicUse: "compat" },
} as const satisfies Record<string, CoreUiOwnershipOverride>;

function ownerL1ForOwnerL2(ownerL2: CoreUiComponentOwnerL2): CoreUiComponentOwnerL1 {
  return ownerL2.slice(0, ownerL2.indexOf(".")) as CoreUiComponentOwnerL1;
}

function defaultPublicUse(registration: CoreUiComponentRegistration): CoreUiComponentPublicUse {
  if (registration.uiLevel === 1) return "business";
  if (registration.accessLayer === "private-impl") return "core-only";
  if (registration.accessLayer === "core-internal" || registration.accessLayer === "foundation") return "core-only";
  return "core-only";
}

function defaultRole(registration: CoreUiComponentRegistration): CoreUiComponentRole {
  if (registration.uiLevel === 1) return "entry";
  if (registration.accessLayer === "foundation") return "foundation";
  if (registration.accessLayer === "private-impl") return "private";
  if (registration.kind === "cell" || registration.kind === "status") return "primitive";
  return "renderer";
}

function defaultOwnerL2(registration: CoreUiComponentRegistration): CoreUiComponentOwnerL2 {
  const byName = OWNER_BY_NAME[registration.name as keyof typeof OWNER_BY_NAME]?.ownerL2;
  if (byName) return byName;

  if (registration.accessLayer === "foundation" || registration.accessLayer === "private-impl") return "common.foundation";
  if (registration.kind === "data") return "data.table";
  if (registration.kind === "cell") return "data.cell";
  if (registration.kind === "form") return "common.input";
  if (registration.kind === "picker") return "common.selection";
  if (registration.kind === "navigation" || registration.kind === "toolbar") return "common.chrome";
  if (registration.kind === "overlay") return "common.overlay";
  if (registration.kind === "status") return "common.display";
  if (registration.kind === "feedback") return "feedback.renderer";
  return "page.blocks";
}

function inferCoreUiOwnership(registration: CoreUiComponentRegistration): CoreUiOwnershipFields {
  const override: CoreUiOwnershipOverride = OWNER_BY_NAME[registration.name as keyof typeof OWNER_BY_NAME] ?? {};
  const ownerL2 = registration.ownerL2 ?? override.ownerL2 ?? defaultOwnerL2(registration);
  return {
    ownerL1: registration.ownerL1 ?? override.ownerL1 ?? ownerL1ForOwnerL2(ownerL2),
    ownerL2,
    role: registration.role ?? override.role ?? defaultRole(registration),
    publicUse: registration.publicUse ?? override.publicUse ?? defaultPublicUse(registration),
  };
}

function enrichCoreUiComponentRegistration(
  registration: CoreUiComponentRegistration,
): CoreUiComponentRegistration {
  return {
    ...inferCoreUiOwnership(registration),
    ...registration,
  };
}

function buildCoreUiCompositionGraph(
  registrations: readonly CoreUiComponentRegistration[],
): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const foundations = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const registration of registrations) {
    const compositionTargets = registration.composes ?? registration.includes ?? [];
    const foundationTargets = registration.foundations ?? [];

    composes.set(registration.name, compositionTargets);
    foundations.set(registration.name, foundationTargets);

    for (const target of compositionTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
    for (const target of foundationTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
  }

  const sortedUsedBy = new Map<string, readonly string[]>();
  for (const [name, list] of usedBy) {
    sortedUsedBy.set(name, [...new Set(list)].sort());
  }

  return { composes, foundations, usedBy: sortedUsedBy };
}

const coreUiComponentRegistryEnriched = coreUiComponentRegistryRaw.map(enrichCoreUiComponentRegistration);

const coreUiCompositionGraph = buildCoreUiCompositionGraph(coreUiComponentRegistryEnriched);

export const coreUiComponentRegistry: readonly CoreUiComponentRegistration[] = coreUiComponentRegistryEnriched;

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);

/**
 * 反向计算组合关系：由 composes/foundations 推导出每个 entry 被谁使用。
 * 注意：usedBy 不要手写，必须由 registry 反向计算，否则会和 composes 漂移。
 */
export function getCoreUiCompositionGraph(): CoreUiCompositionGraph {
  return coreUiCompositionGraph;
}
