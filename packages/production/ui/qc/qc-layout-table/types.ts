import type { QcLayoutPart, QcTemplateMethodField, QcTemplateTestItem } from "@workspace/production/server/qc";
import type { QcFieldValues } from "../useQcFormulaEngine";

export interface LayoutRenderContext {
  test?: QcTemplateTestItem;
  values: QcFieldValues;
  onFieldChange: (key: string, value: string) => void;
  fieldByName: Map<string, QcTemplateMethodField>;
  fieldByKey: Map<string, QcTemplateMethodField>;
  readonlyDisplayKeys?: Set<string>;
  firstPartByKey?: Map<string, QcLayoutPart>;
  formulaInputKeys?: Set<string>;
  formulaDependencies?: Map<string, Set<string>>;
  advancedPartMetadata?: Map<string, QcLayoutPart>;
  sectionAliases?: Record<string, string>;
  inTable?: boolean;
  readOnly?: boolean;
  advancedMode?: boolean;
  activeAdvancedOutputKey?: string | null;
  onAdvancedOutputHover?: (fieldKey: string | null) => void;
  referenceSourceKeyFor?: (fieldKey: string) => string | undefined;
}
