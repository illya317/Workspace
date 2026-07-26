"use client";

import type { ReactNode } from "react";
import { createEmptySection, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import DocumentEditorCanvas from "./DocumentEditorCanvas";
import DocumentPreview from "./DocumentPreview";
import { DocumentRuntimeValueSlot } from "./runtime-value-slot";
import type { DocumentEditorCanvasProps, EditorDocument } from "./types";

type DocumentWorkspaceBaseSpec = {
  key: string;
};

export type DocumentWorkspaceEditSpec = DocumentWorkspaceBaseSpec & {
  mode: "edit";
  editor: DocumentEditorCanvasProps;
};

export type DocumentWorkspacePreviewSpec = DocumentWorkspaceBaseSpec & {
  mode: "preview";
  document: EditorDocument;
  values?: Record<string, unknown>;
  slotPresentation?: "default" | "value";
};

export type DocumentWorkspaceSpec = DocumentWorkspaceEditSpec | DocumentWorkspacePreviewSpec;

/** @ui-specialized-surface Platform document editor, preview, and runtime paper implementation. */
export function createDocumentWorkspaceSection(spec: DocumentWorkspaceSpec): BodySurfaceSectionSpec {
  return createEmptySection(spec.key, { presentation: "plain", content: renderDocumentWorkspace(spec) });
}

function renderDocumentWorkspace(spec: DocumentWorkspaceSpec): ReactNode {
  if (spec.mode === "edit") return <DocumentEditorCanvas {...spec.editor} />;
  return <DocumentPreview
    document={spec.document}
    values={spec.values}
    renderSlot={spec.slotPresentation === "value" ? ({ part, value }) => <DocumentRuntimeValueSlot part={part} value={value} /> : undefined}
  />;
}
