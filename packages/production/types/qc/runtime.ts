import type { EditorBlock, EditorDocument, FieldModel } from "@workspace/platform/document-editor";

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
