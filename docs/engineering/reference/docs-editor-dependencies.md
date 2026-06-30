# Docs Editor Third-Party Dependencies

Owner: Platform Docs / Feature.

用途：记录 `/docs/editor` 文档模板编辑器依赖的外部包、锁定版本、许可和隔离边界。修改编辑器依赖时，必须同步更新本文件、`package.json` 和 `package-lock.json`。

## 锁定依赖

| 包 | 版本 | 许可 | 用途 | 边界 |
|---|---:|---|---|---|
| `@tiptap/core` | `3.27.1` | MIT | Tiptap 核心编辑器 | 只在 `packages/platform/document-editor` 内通过 adapter 使用 |
| `@tiptap/react` | `3.27.1` | MIT | React editor binding | 只暴露 `DocumentEditorCanvas`，业务侧不直接接触 Tiptap editor 对象 |
| `@tiptap/starter-kit` | `3.27.1` | MIT | 基础段落、标题、列表等编辑能力 | Tiptap JSON 不是持久化真相，持久化格式是 `EditorDocument` |
| `@tiptap/extension-table` | `3.27.1` | MIT | 表格编辑命令 | 表格语义写回 `EditorDocument.table` |
| `@tiptap/extension-table-cell` | `3.27.1` | MIT | 表格单元格节点 | 不把业务公式绑死在单元格地址上 |
| `@tiptap/extension-table-header` | `3.27.1` | MIT | 表头节点 | 同上 |
| `@tiptap/extension-table-row` | `3.27.1` | MIT | 表格行节点 | 同上 |
| `@tiptap/extension-underline` | `3.27.1` | MIT | 下划线文本样式 | 文本样式；字段填写位仍用 `fieldSlot.display` 表达 |
| `@tiptap/extension-text-align` | `3.27.1` | MIT | 段落/标题对齐 | 编辑层能力，导出层单独映射 |
| `@tiptap/extension-subscript` | `3.27.1` | MIT | 下标 | 编辑层能力，导出层单独映射 |
| `@tiptap/extension-superscript` | `3.27.1` | MIT | 上标 | 编辑层能力，导出层单独映射 |
| `hyperformula` | `3.3.0` | GPL-3.0-only | 公式计算候选引擎 | 只能在 formula adapter 内 import；业务侧不得直接 import |
| `docx` | `9.7.1` | MIT | DOCX 导出 | 只能在 DOCX export adapter 内 import；docx 对象不得进入业务模型 |
| `lucide-react` | `1.22.0` | ISC | 编辑器 ribbon 图标 | 只用于 editor 局部图标，不替代 Core `ActionGlyph/IconGlyph` |

## 维护规则

- 所有版本必须精确锁定，不使用 `^` 或 `~`。
- Tiptap 节点和命令只能作为编辑器实现细节；公开持久化接口仍是 `EditorDocument` / `FieldModel`。
- HyperFormula 的 GPL-3.0-only 许可需要合规确认。闭源商用前不能把它作为不可替换的业务依赖。
- `docx` 只负责导出，不反向污染 `EditorDocument`。
- `lucide-react` 仅用于 `/docs/editor` 这类局部编辑器 ribbon。Core toolbar 图标仍走 Core 自己的 `ActionGlyph/IconGlyph` 体系。
- 如果后续 fork snapshot 到个人 GitHub，记录 fork 地址、上游 tag/commit、同步命令和本地替换策略后，再改本文件。
