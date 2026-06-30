"use client";

import { Node, mergeAttributes } from "@tiptap/core";

export const PageBreakNode = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      metadata: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-editor-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-editor-page-break": "true",
        class: "my-5 flex items-center gap-3 text-[11px] font-medium text-slate-400",
      }),
      ["span", { class: "h-px flex-1 border-t border-dashed border-slate-300" }],
      ["span", { class: "rounded-full border border-slate-200 bg-white px-2 py-0.5" }, "分页"],
      ["span", { class: "h-px flex-1 border-t border-dashed border-slate-300" }],
    ];
  },

  renderText() {
    return "\n[分页]\n";
  },
});
