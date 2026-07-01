"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  CalendarDays,
  CircleCheck,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Pilcrow,
  Rows3,
  SquareCheck,
  SquareDashedBottom,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react";
import SubscriptExtension from "@tiptap/extension-subscript";
import SuperscriptExtension from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { editorDocumentToTiptapJson, tiptapJsonToEditorDocument } from "./adapters";
import { PageBreakNode } from "./page-break-extension";
import { DateSlot, FieldSlot, FormulaSlot, SignatureSlot } from "./slot-extensions";
import { SlotInspector, collectFormulaDisplayTokens, collectReferenceTokens, type SelectedSlot, type SlotAnchor } from "./SlotInspector";
import { nextAvailableSlotAlias, numberedSlotKind, slotContextLabel } from "./slot-numbering";
import type { DocumentEditorCanvasProps, EditorSlotInline, EditorSlotType } from "./types";

const DEFAULT_STICKY_HEADER_OFFSET = 44;
const SLOT_INSPECTOR_WIDTH = 320;
const SLOT_INSPECTOR_ESTIMATED_HEIGHT = 460;
const SLOT_INSPECTOR_EDGE_PADDING = 8;
const PAPER_FONT_FAMILY = "\"FangSong\", \"仿宋\", \"STFangsong\", serif";
type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>;

export default function DocumentEditorCanvas({
  document,
  fieldModel,
  editable = true,
  onChange,
}: DocumentEditorCanvasProps) {
  const [stickyHeaderOffset, setStickyHeaderOffset] = useState(DEFAULT_STICKY_HEADER_OFFSET);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const serializedDocument = useMemo(() => JSON.stringify(editorDocumentToTiptapJson(document)), [document]);
  const referenceTokens = useMemo(() => collectReferenceTokens(document), [document]);
  const formulaTokens = useMemo(() => collectFormulaDisplayTokens(document, fieldModel), [document, fieldModel]);
  const lastAppliedDocument = useRef(serializedDocument);
  const lastSlotAnchor = useRef<SelectedSlot["anchor"] | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit,
      SubscriptExtension,
      SuperscriptExtension,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      PageBreakNode,
      FieldSlot,
      FormulaSlot,
      DateSlot,
      SignatureSlot,
    ],
    editable,
    content: editorDocumentToTiptapJson(document),
    onUpdate: ({ editor: nextEditor }) => {
      const nextDocument = tiptapJsonToEditorDocument(nextEditor.getJSON(), document);
      lastAppliedDocument.current = JSON.stringify(editorDocumentToTiptapJson(nextDocument));
      onChange?.(nextDocument);
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

  useEffect(() => {
    if (!editor) return;
    const selectedFromNode = (pos: number, node: { type: { name: string }; attrs: unknown }) => {
      if (!isEditorSlotType(node.type.name)) return null;
      return { pos, type: node.type.name, attrs: node.attrs as EditorSlotInline, anchor: lastSlotAnchor.current ?? slotAnchor(editor, pos, editorScrollRef.current) };
    };
    const syncSelection = () => {
      const selection = editor.state.selection;
      if (selection instanceof NodeSelection && isEditorSlotType(selection.node.type.name)) {
        setSelectedSlot(selectedFromNode(selection.from, selection.node));
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("span[data-editor-slot]");
      if (!target) return;
      const atCoords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      const rawPos = atCoords?.pos ?? editor.view.posAtDOM(target, 0);
      const candidates = [rawPos, Math.max(0, rawPos - 1), editor.view.posAtDOM(target, 0)];
      const slot = candidates
        .map((pos) => {
          const node = editor.state.doc.nodeAt(pos);
          return node ? selectedFromNode(pos, node) : null;
        })
        .find(Boolean);
      if (!slot) return;
      lastSlotAnchor.current = anchorFromElement(target, editorScrollRef.current);
      slot.anchor = lastSlotAnchor.current;
      editor.commands.setNodeSelection(slot.pos);
      setSelectedSlot(slot);
    };
    const updateAnchor = () => setSelectedSlot((current) => {
      if (!current) return current;
      const anchor = slotAnchor(editor, current.pos, editorScrollRef.current);
      lastSlotAnchor.current = anchor;
      return { ...current, anchor };
    });
    editor.view.dom.addEventListener("click", handleClick);
    editor.on("selectionUpdate", syncSelection);
    window.addEventListener("resize", updateAnchor);
    return () => {
      editor.view.dom.removeEventListener("click", handleClick);
      editor.off("selectionUpdate", syncSelection);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [editor]);

  useEffect(() => {
    const header = documentGlobalQuerySelector("nav.sticky");
    if (!header) return;
    const updateOffset = () => setStickyHeaderOffset(Math.ceil(header.getBoundingClientRect().height));
    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(header);
    window.addEventListener("resize", updateOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, []);

  if (!editor) return null;

  const getCurrentReferenceTokens = () => collectReferenceTokens(tiptapJsonToEditorDocument(editor.getJSON(), document));

  return (
    <div className="space-y-3 overflow-visible bg-slate-100">
      <div
        className="sticky z-20 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
        style={{ top: stickyHeaderOffset }}
      >
        <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-100 pb-2">
          {renderTableRibbon(editor, editable)}
          {renderTextRibbon(editor, editable)}
        </div>
        <div className="flex min-h-14 flex-wrap items-center gap-3 pt-2">
          {renderStyleRibbon(editor, editable)}
          {renderInsertRibbon(editor, editable, document)}
        </div>
      </div>
      <div ref={editorScrollRef} className="relative overflow-auto px-4 py-5">
        <div
          className="mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white px-[16mm] py-[15mm] text-[13px] leading-7 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.10),0_16px_38px_rgba(15,23,42,0.12)]"
          style={{ fontFamily: PAPER_FONT_FAMILY }}
        >
          <EditorContent
            editor={editor}
            className={[
              "docs-editor-paper min-h-[260mm]",
              "[&_.ProseMirror]:min-h-[260mm] [&_.ProseMirror]:outline-none",
              "[&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:mt-2 [&_.ProseMirror_h1]:text-center [&_.ProseMirror_h1]:text-[22px] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:leading-9",
              "[&_.ProseMirror_p]:my-1 [&_.ProseMirror_p]:min-h-7",
              "[&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:text-[18px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:leading-8",
              "[&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:text-[16px] [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:leading-7",
              "[&_.ProseMirror_h4]:mb-2 [&_.ProseMirror_h4]:mt-2 [&_.ProseMirror_h4]:text-[14px] [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:leading-7",
              "[&_.ProseMirror_table]:my-4 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:table-fixed",
              "[&_.ProseMirror_td]:overflow-hidden [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-slate-500 [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_td]:text-center [&_.ProseMirror_td]:align-middle",
              "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-slate-600 [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:text-center [&_.ProseMirror_th]:align-middle",
              "[&_.ProseMirror_.resize-cursor]:cursor-col-resize",
              "[&_.selectedCell]:bg-sky-100",
            ].join(" ")}
          />
        </div>
        <SlotInspector editor={editor} editable={editable} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} tokens={referenceTokens} formulaTokens={formulaTokens} fieldModel={fieldModel} getReferenceTokens={getCurrentReferenceTokens} getCurrentDocument={() => tiptapJsonToEditorDocument(editor.getJSON(), document)} />
      </div>
    </div>
  );
}

function documentGlobalQuerySelector(selector: string) {
  if (typeof window === "undefined") return null;
  return window.document.querySelector<HTMLElement>(selector);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderTextRibbon(editor: NonNullable<ReturnType<typeof useEditor>>, editable: boolean) {
  return (
    <>
      <ToolbarGroup label="字体">
        <ToolbarButton label="字体选择暂未接入" disabled><Type size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="字号选择暂未接入" disabled><Pilcrow size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="加粗" active={editor.isActive("bold")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run()}><Bold size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="斜体" active={editor.isActive("italic")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run()}><Italic size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="下划线" active={editor.isActive("underline")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run()}><UnderlineIcon size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="删除线" active={editor.isActive("strike")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run()}><Strikethrough size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="下标" active={editor.isActive("subscript")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleSubscript().run()}><Subscript size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="上标" active={editor.isActive("superscript")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleSuperscript().run()}><Superscript size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="颜色暂未接入" disabled><Palette size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup label="段落">
        <ToolbarButton label="左对齐" active={editor.isActive({ textAlign: "left" })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign("left").run()}><AlignLeft size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="居中" active={editor.isActive({ textAlign: "center" })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign("center").run()}><AlignCenter size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="右对齐" active={editor.isActive({ textAlign: "right" })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign("right").run()}><AlignRight size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="两端对齐" active={editor.isActive({ textAlign: "justify" })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign("justify").run()}><AlignJustify size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="项目符号" active={editor.isActive("bulletList")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run()}><List size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="编号列表" active={editor.isActive("orderedList")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run()}><ListOrdered size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
    </>
  );
}

function renderStyleRibbon(editor: NonNullable<ReturnType<typeof useEditor>>, editable: boolean) {
  return (
    <>
      <ToolbarGroup label="样式">
        <ToolbarButton label="正文" active={editor.isActive("paragraph")} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run()}><Pilcrow size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="标题 1" active={editor.isActive("heading", { level: 1 })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 1 }).run()}><Heading1 size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="标题 2" active={editor.isActive("heading", { level: 2 })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 2 }).run()}><Heading2 size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="标题 3" active={editor.isActive("heading", { level: 3 })} disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 3 }).run()}><Heading3 size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
    </>
  );
}

function renderInsertRibbon(editor: NonNullable<ReturnType<typeof useEditor>>, editable: boolean, document: DocumentEditorCanvasProps["document"]) {
  return (
    <>
      <ToolbarGroup label="插入">
        <ToolbarButton label="普通输入" disabled={!editable} onClick={() => insertSlot(editor, document, "fieldSlot", { alias: "i", label: "普通", slotKind: "plain", inputType: "text" })}><GlyphIcon>i</GlyphIcon></ToolbarButton>
        <ToolbarButton label="输入 x" disabled={!editable} onClick={() => insertSlot(editor, document, "fieldSlot", { label: "输入", slotKind: "variable", inputType: "text", valueType: "number", numberFormat: "plain" })}><GlyphIcon>x</GlyphIcon></ToolbarButton>
        <ToolbarButton label="输出 y" disabled={!editable} onClick={() => insertSlot(editor, document, "formulaSlot", { label: "输出", slotKind: "formula" })}><GlyphIcon>y</GlyphIcon></ToolbarButton>
        <ToolbarButton label="引用 z" disabled={!editable} onClick={() => insertSlot(editor, document, "formulaSlot", { label: "引用", slotKind: "reference" })}><GlyphIcon>z</GlyphIcon></ToolbarButton>
        <ToolbarButton label="单选框" disabled={!editable} onClick={() => insertSlot(editor, document, "fieldSlot", { alias: "i", label: "是否", slotKind: "choice", inputType: "radio", options: ["是", "否"] })}><CircleCheck size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="多选框" disabled={!editable} onClick={() => insertSlot(editor, document, "fieldSlot", { alias: "i", label: "多选", slotKind: "choice", inputType: "checkbox", options: ["选项1", "选项2"] })}><SquareCheck size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="选择框" disabled={!editable} onClick={() => insertSlot(editor, document, "fieldSlot", { alias: "i", label: "选择", slotKind: "choice", inputType: "select", options: ["选项1", "选项2"] })}><ListChecks size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="日期" disabled={!editable} onClick={() => insertSlot(editor, document, "dateSlot", { alias: "i", label: "日期", slotKind: "plain", inputType: "date", valueType: "date" })}><CalendarDays size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="分页占位符" disabled={!editable} onClick={() => insertPageBreak(editor)}><SquareDashedBottom size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
    </>
  );
}

function renderTableRibbon(editor: NonNullable<ReturnType<typeof useEditor>>, editable: boolean) {
  const tableActive = editor.isActive("table");
  const disabled = !editable || !tableActive;
  return (
    <>
      <ToolbarGroup label="表格">
        <ToolbarButton label="插入表格" disabled={!editable} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup label="行">
        <ToolbarButton label="在上方插入行" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run()}><BetweenHorizontalStart size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="在下方插入行" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run()}><BetweenHorizontalEnd size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="删除行" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run()}><StackedIcon main={<Rows3 size={15} strokeWidth={1.9} />} badge={<Trash2 size={9} strokeWidth={2.2} />} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup label="列">
        <ToolbarButton label="在左侧插入列" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run()}><BetweenVerticalStart size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="在右侧插入列" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run()}><BetweenVerticalEnd size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="删除列" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run()}><StackedIcon main={<Columns3 size={15} strokeWidth={1.9} />} badge={<Trash2 size={9} strokeWidth={2.2} />} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup label="单元格">
        <ToolbarButton label="合并单元格" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).mergeCells().run()}><TableCellsMerge size={16} strokeWidth={1.9} /></ToolbarButton>
        <ToolbarButton label="拆分单元格" disabled={disabled} onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).splitCell().run()}><TableCellsSplit size={16} strokeWidth={1.9} /></ToolbarButton>
      </ToolbarGroup>
    </>
  );
}

function ToolbarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border-r border-slate-200 pr-3 last:border-r-0 last:pr-0">
      <div className="flex items-center gap-1">{children}</div>
      <div className="text-[10px] leading-none text-slate-400">{label}</div>
    </div>
  );
}

function StackedIcon({ main, badge }: { main: ReactNode; badge: ReactNode }) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      {main}
      <span className="absolute -bottom-1 -right-1 rounded bg-white text-slate-700">{badge}</span>
    </span>
  );
}

function GlyphIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center font-serif text-[15px] font-semibold leading-none">
      {children}
    </span>
  );
}

function ToolbarButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  const buttonClassName = [
    "inline-flex h-8 w-8 items-center justify-center rounded border transition",
    active
      ? "border-cyan-300 bg-cyan-50 text-cyan-700"
      : "border-transparent bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-100 disabled:text-slate-400",
  ].join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

function insertSlot(editor: TiptapEditor, document: DocumentEditorCanvasProps["document"], type: EditorSlotType, attrs: Partial<EditorSlotInline>) {
  const id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  const metadata = attrs.metadata ?? nearestSlotMetadata(editor);
  const nextAttrs = { ...attrs, metadata };
  const currentDocument = tiptapJsonToEditorDocument(editor.getJSON(), document);
  const kind = numberedSlotKind(nextAttrs.slotKind);
  const alias = kind ? nextAvailableSlotAlias(currentDocument, kind, slotContextLabel(nextAttrs as EditorSlotInline)) : nextAttrs.alias;
  editor.chain().focus(undefined, { scrollIntoView: false }).insertContent({
    type,
    attrs: {
      id,
      fieldKey: `draft/${id}`,
      label: nextAttrs.label,
      alias,
      slotKind: nextAttrs.slotKind,
      inputType: nextAttrs.inputType,
      valueType: nextAttrs.valueType,
      numberFormat: nextAttrs.numberFormat,
      options: nextAttrs.options,
      width: "3rem",
      align: "center",
      display: type === "signatureSlot" || type === "dateSlot" ? "underline" : "box",
      metadata,
    },
  }).run();
}

function nearestSlotMetadata(editor: TiptapEditor) {
  const selectionPos = editor.state.selection.from;
  const candidates: { distance: number; metadata: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!isEditorSlotType(node.type.name) || !isRecord(node.attrs.metadata)) return;
    candidates.push({ distance: Math.abs(pos - selectionPos), metadata: node.attrs.metadata });
  });
  return candidates.sort((left, right) => left.distance - right.distance)[0]?.metadata;
}

function insertPageBreak(editor: NonNullable<ReturnType<typeof useEditor>>) {
  editor.chain().focus(undefined, { scrollIntoView: false }).insertContent({
    type: "pageBreak",
    attrs: {
      id: `page-break-${Math.random().toString(36).slice(2, 9)}`,
      metadata: { kind: "pageBreakPlaceholder" },
    },
  }).run();
}

function isEditorSlotType(value: string): value is EditorSlotType {
  return value === "fieldSlot" || value === "formulaSlot" || value === "dateSlot" || value === "signatureSlot";
}

function slotAnchor(editor: TiptapEditor, pos: number, container: HTMLElement | null): SlotAnchor {
  const selected = editor.view.dom.querySelector<HTMLElement>("span[data-editor-slot].ProseMirror-selectednode");
  const dom = selected ?? editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) return anchorFromElement(dom, container);
  return anchorFromRect(editor.view.coordsAtPos(pos), container);
}

function anchorFromElement(element: HTMLElement, container: HTMLElement | null): SlotAnchor {
  return anchorFromRect(element.getBoundingClientRect(), container);
}

function anchorFromRect(rect: { top: number; left: number; right: number; bottom?: number }, container: HTMLElement | null): SlotAnchor {
  const gap = 2;
  if (!container) {
    const scrollY = typeof window === "undefined" ? 0 : window.scrollY;
    const viewportBottom = scrollY + (typeof window === "undefined" ? SLOT_INSPECTOR_ESTIMATED_HEIGHT : window.innerHeight) - SLOT_INSPECTOR_EDGE_PADDING;
    const preferredTop = rect.top + scrollY;
    const fallbackTop = rect.top + scrollY - SLOT_INSPECTOR_ESTIMATED_HEIGHT - gap;
    return {
      top: preferredTop + SLOT_INSPECTOR_ESTIMATED_HEIGHT <= viewportBottom ? preferredTop : Math.max(scrollY + SLOT_INSPECTOR_EDGE_PADDING, fallbackTop),
      left: rect.right + gap + (typeof window === "undefined" ? 0 : window.scrollX),
    };
  }
  const containerRect = container.getBoundingClientRect();
  const viewportLeft = container.scrollLeft + SLOT_INSPECTOR_EDGE_PADDING;
  const viewportRight = container.scrollLeft + container.clientWidth - SLOT_INSPECTOR_EDGE_PADDING;
  const viewportTop = container.scrollTop + SLOT_INSPECTOR_EDGE_PADDING;
  const viewportBottom = container.scrollTop + container.clientHeight - SLOT_INSPECTOR_EDGE_PADDING;
  const preferredLeft = rect.right - containerRect.left + container.scrollLeft + gap;
  const fallbackLeft = rect.left - containerRect.left + container.scrollLeft - SLOT_INSPECTOR_WIDTH - gap;
  const maxLeft = viewportRight - SLOT_INSPECTOR_WIDTH;
  const resolvedLeft = preferredLeft + SLOT_INSPECTOR_WIDTH <= viewportRight
    ? preferredLeft
    : Math.min(Math.max(fallbackLeft, viewportLeft), Math.max(viewportLeft, maxLeft));
  const preferredTop = rect.top - containerRect.top + container.scrollTop;
  const fallbackTop = rect.top - containerRect.top + container.scrollTop - SLOT_INSPECTOR_ESTIMATED_HEIGHT - gap;
  const resolvedTop = preferredTop + SLOT_INSPECTOR_ESTIMATED_HEIGHT <= viewportBottom
    ? preferredTop
    : Math.max(viewportTop, fallbackTop);
  return {
    top: resolvedTop,
    left: resolvedLeft,
  };
}
