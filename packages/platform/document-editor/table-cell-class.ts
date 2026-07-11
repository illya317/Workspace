import type { Editor } from "@tiptap/core";

export function toggleCellClassName(editor: Editor, className: string) {
  const tokens = new Set(currentCellClassName(editor).split(/\s+/).filter(Boolean));
  if (tokens.has(className)) {
    tokens.delete(className);
  } else {
    tokens.add(className);
  }
  editor.chain().focus(undefined, { scrollIntoView: false }).setCellAttribute("className", [...tokens].join(" ") || null).run();
}

export function cellHasClassName(editor: Editor, className: string) {
  return currentCellClassName(editor).split(/\s+/).includes(className);
}

function currentCellClassName(editor: Editor) {
  const cell = editor.getAttributes("tableCell");
  const header = editor.getAttributes("tableHeader");
  return textValue(cell.className) || textValue(header.className);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
