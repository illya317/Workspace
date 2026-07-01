"use client";

import { Extension, type Editor } from "@tiptap/core";

type MetadataNode = {
  attrs: Record<string, unknown>;
  isText: boolean;
  type: {
    name: string;
    spec: { attrs?: Record<string, unknown> };
  };
};

export const DocumentMetadataAttributes = Extension.create({
  name: "documentMetadataAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph", "table", "tableRow", "tableCell", "tableHeader"],
        attributes: {
          id: { default: null },
          metadata: {
            default: null,
            renderHTML: (attributes) => annotationHtmlAttributes(attributes.metadata),
          },
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          attachment: { default: null },
          fieldKey: { default: null },
        },
      },
      {
        types: ["table"],
        attributes: {
          title: { default: null },
          label: { default: null },
          columnWidths: { default: null },
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          height: { default: null },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          rawText: { default: null },
          align: { default: null },
          bold: { default: null },
          width: { default: null },
          className: { default: null },
        },
      },
    ];
  },
});

export function toggleAnnotationSelection(editor: Editor) {
  setAnnotationSelection(editor, !selectionHasAnnotation(editor));
}

export function selectionHasAnnotation(editor: Editor) {
  const { state } = editor;
  const { selection } = state;
  let found = false;
  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (metadataAnnotation(node.attrs?.metadata)) found = true;
    return !found;
  });
  return found || metadataAnnotation(selection.$from.parent.attrs?.metadata);
}

export function metadataAnnotation(value: unknown) {
  return isRecord(value) && (value.annotation === true || value.noPrint === true);
}

export function annotationHtmlAttributes(metadata: unknown) {
  if (!metadataAnnotation(metadata)) return {};
  return {
    "data-docs-annotation": "true",
    class: "docs-editor-annotation print:hidden",
  };
}

function setAnnotationSelection(editor: Editor, enabled: boolean) {
  const { state, view } = editor;
  const { selection } = state;
  const positions = new Set<number>();
  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.isText || !hasMetadataAttribute(node as MetadataNode)) return;
    if (node.type.name === "doc") return;
    positions.add(pos);
  });

  if (!positions.size && selection.$from.depth > 0) {
    const parent = selection.$from.parent as unknown as MetadataNode;
    const pos = selection.$from.before(selection.$from.depth);
    if (hasMetadataAttribute(parent)) positions.add(pos);
  }

  let tr = state.tr;
  positions.forEach((pos) => {
    const node = tr.doc.nodeAt(pos);
    if (!node || !hasMetadataAttribute(node as MetadataNode)) return;
    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      metadata: patchAnnotationMetadata(node.attrs.metadata, enabled),
    });
  });
  if (tr.docChanged) view.dispatch(tr.scrollIntoView());
}

function hasMetadataAttribute(node: MetadataNode) {
  return Object.prototype.hasOwnProperty.call(node.type.spec.attrs ?? {}, "metadata");
}

function patchAnnotationMetadata(value: unknown, enabled: boolean) {
  const next = isRecord(value) ? { ...value } : {};
  if (enabled) next.annotation = true;
  else {
    delete next.annotation;
    delete next.noPrint;
  }
  return Object.keys(next).length ? next : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
