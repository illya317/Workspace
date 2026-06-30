"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { editorDocumentToTiptapJson, tiptapJsonToEditorDocument } from "./adapters";
import { DateSlot, FieldSlot, FormulaSlot, SignatureSlot } from "./slot-extensions";
import type { DocumentEditorCanvasProps, EditorSlotInline, FieldDefinition } from "./types";

export default function DocumentEditorCanvas({
  document,
  fieldModel,
  editable = true,
  onChange,
}: DocumentEditorCanvasProps) {
  const serializedDocument = useMemo(() => JSON.stringify(editorDocumentToTiptapJson(document)), [document]);
  const lastAppliedDocument = useRef(serializedDocument);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      FieldSlot,
      FormulaSlot,
      DateSlot,
      SignatureSlot,
    ],
    editable,
    content: editorDocumentToTiptapJson(document),
    onUpdate: ({ editor: nextEditor }) => {
      lastAppliedDocument.current = JSON.stringify(nextEditor.getJSON());
      onChange?.(tiptapJsonToEditorDocument(nextEditor.getJSON(), document));
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || serializedDocument === lastAppliedDocument.current) return;
    editor.commands.setContent(JSON.parse(serializedDocument), { emitUpdate: false });
    lastAppliedDocument.current = serializedDocument;
  }, [editor, serializedDocument]);

  if (!editor) return null;

  return (
    <div className="space-y-3 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>标题</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>表格</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().addRowBefore().run()}>行上</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().addRowAfter().run()}>行下</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().deleteRow().run()}>删行</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().addColumnBefore().run()}>列前</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().addColumnAfter().run()}>列后</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().deleteColumn().run()}>删列</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().mergeCells().run()}>合并</ToolbarButton>
        <ToolbarButton disabled={!editable} onClick={() => editor.chain().focus().splitCell().run()}>拆分</ToolbarButton>
        {normalizeFieldDefinitions(fieldModel.fields).length ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1 border-l border-slate-200 pl-2">
            {normalizeFieldDefinitions(fieldModel.fields).slice(0, 10).map((field) => (
              <ToolbarButton
                key={fieldKey(field)}
                disabled={!editable}
                title={`插入字段：${fieldLabel(field)}`}
                onClick={() => insertFieldSlot(editor, field)}
              >
                {fieldLabel(field)}
              </ToolbarButton>
            ))}
          </div>
        ) : null}
      </div>
      <div className="overflow-auto px-4 py-5">
        <div className="mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white px-[16mm] py-[15mm] text-[13px] leading-7 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.10),0_16px_38px_rgba(15,23,42,0.12)]">
          <EditorContent
            editor={editor}
            className={[
              "docs-editor-paper min-h-[260mm]",
              "[&_.ProseMirror]:min-h-[260mm] [&_.ProseMirror]:outline-none",
              "[&_.ProseMirror_table]:my-4 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:table-fixed",
              "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-slate-500 [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_td]:align-top",
              "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-slate-600 [&_.ProseMirror_th]:bg-slate-100 [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:text-left",
              "[&_.selectedCell]:bg-sky-100",
            ].join(" ")}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="h-8 rounded border border-slate-300 bg-white px-2 text-xs leading-none text-slate-700 transition hover:border-slate-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function insertFieldSlot(editor: NonNullable<ReturnType<typeof useEditor>>, field: FieldDefinition) {
  const type = slotKindForField(field);
  const key = fieldKey(field);
  const attrs: EditorSlotInline = {
    type,
    id: `${key}-${type}`,
    fieldKey: key,
    label: fieldLabel(field),
    unit: field.unit,
    width: 96,
    align: "left",
    display: type === "fieldSlot" && (field.type === "text" || field.valueType === "text") ? "box" : "underline",
    formula: field.formula,
  };

  editor.chain().focus().insertContent({ type, attrs }).run();
}

function slotKindForField(field: FieldDefinition): EditorSlotInline["type"] {
  if (field.type === "date" || field.valueType === "date") return "dateSlot";
  if (field.type === "signature" || field.valueType === "signature") return "signatureSlot";
  if (field.formula || field.mode === "formula" || field.attr === "calculated") return "formulaSlot";
  return "fieldSlot";
}

function normalizeFieldDefinitions(fields: DocumentEditorCanvasProps["fieldModel"]["fields"]): FieldDefinition[] {
  return Array.isArray(fields) ? fields : Object.values(fields);
}

function fieldKey(field: FieldDefinition) {
  return field.fieldKey ?? field.key ?? field.name ?? "field";
}

function fieldLabel(field: FieldDefinition) {
  return field.label ?? field.name ?? field.fieldKey ?? field.key ?? "字段";
}
