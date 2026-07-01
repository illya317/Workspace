import "server-only";

import { getPublishedQcOfficialTemplateByProductKey, listPublishedQcOfficialTemplateSummaries } from "@workspace/platform/server/docs-editor";
import type { EditorBlock, EditorDocument, FieldModel } from "@workspace/platform/document-editor";
import type { QcBatchSummary, QcBatchTemplateSnapshot } from "./types";

export interface QcEditorRuntimeTest {
  key: string;
  sequence: string;
  name: string;
  blocks: EditorBlock[];
}

export interface QcEditorRuntimeStage {
  key: string;
  label: string;
  index: number;
  precheckBlocks: EditorBlock[];
  tests: QcEditorRuntimeTest[];
}

export interface QcEditorRuntimeTemplate {
  templateId: number;
  templateVersion: number;
  productKey: string;
  productName: string;
  document: EditorDocument;
  fieldModel: FieldModel;
  stages: QcEditorRuntimeStage[];
}

export interface QcOfficialTemplateProduct {
  id: string;
  productName: string;
}

type Section = "stage" | "precheck" | "test";

export async function listQcOfficialTemplateProducts(): Promise<QcOfficialTemplateProduct[]> {
  const summaries = await listPublishedQcOfficialTemplateSummaries();
  return summaries.map((summary) => ({
    id: summary.productKey,
    productName: summary.productName,
  }));
}

export async function getQcBatchEditorRuntimeTemplate(batch: QcBatchSummary): Promise<QcEditorRuntimeTemplate | null> {
  const snapshot = batch.templateSnapshot ?? await latestSnapshot(batch.productKey);
  return snapshot ? runtimeTemplateFromSnapshot(snapshot) : null;
}

function runtimeTemplateFromSnapshot(snapshot: QcBatchTemplateSnapshot): QcEditorRuntimeTemplate | null {
  const document = asEditorDocument(snapshot.document);
  const fieldModel = asFieldModel(snapshot.fieldModel);
  if (!document || !fieldModel) return null;
  return {
    templateId: snapshot.templateId,
    templateVersion: snapshot.templateVersion,
    productKey: snapshot.productKey,
    productName: snapshot.productName,
    document,
    fieldModel,
    stages: sliceRuntimeStages(document),
  };
}

async function latestSnapshot(productKey: string): Promise<QcBatchTemplateSnapshot | null> {
  const template = await getPublishedQcOfficialTemplateByProductKey(productKey);
  if (!template) return null;
  return {
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    productKey: template.productKey,
    productName: template.productName,
    document: template.document,
    fieldModel: template.fieldModel,
    capturedAt: new Date().toISOString(),
  };
}

function sliceRuntimeStages(document: EditorDocument) {
  const stages: QcEditorRuntimeStage[] = [];
  let currentStage: QcEditorRuntimeStage | null = null;
  let currentTest: QcEditorRuntimeTest | null = null;
  let section: Section = "stage";

  for (const block of document.blocks) {
    const role = stringMeta(block, "qcRole");
    if (role === "stageHeading") {
      currentStage = {
        key: stringMeta(block, "stageKey") || `stage_${stages.length + 1}`,
        label: stringMeta(block, "stageLabel") || blockText(block),
        index: stages.length,
        precheckBlocks: [],
        tests: [],
      };
      stages.push(currentStage);
      currentTest = null;
      section = "stage";
      continue;
    }
    if (!currentStage) continue;
    if (role === "precheckSectionHeading") {
      currentTest = null;
      section = "precheck";
      continue;
    }
    if (role === "testHeading") {
      currentTest = {
        key: stringMeta(block, "testKey") || `test_${currentStage.tests.length + 1}`,
        sequence: stringMeta(block, "sequence") || blockText(block).match(/^(\S+)/)?.[1] || "",
        name: blockText(block).replace(/^(\S+)\s*/, "").trim(),
        blocks: [],
      };
      currentStage.tests.push(currentTest);
      section = "test";
      continue;
    }
    if (section === "test" && currentTest) {
      currentTest.blocks.push(block);
      continue;
    }
    if (section === "precheck") currentStage.precheckBlocks.push(block);
  }
  return stages;
}

function asEditorDocument(value: unknown): EditorDocument | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Partial<EditorDocument>;
  return document.schemaVersion === 1 && Array.isArray(document.blocks) ? document as EditorDocument : null;
}

function asFieldModel(value: unknown): FieldModel | null {
  if (!value || typeof value !== "object") return null;
  const model = value as Partial<FieldModel>;
  return model.fields ? model as FieldModel : null;
}

function stringMeta(block: EditorBlock, key: string) {
  const value = block.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function blockText(block: EditorBlock) {
  return block.type === "heading" ? block.text : "";
}
