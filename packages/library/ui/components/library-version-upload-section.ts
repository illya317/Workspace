import { createAnalysisSection, createFieldsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";

interface LibraryVersionUploadSectionInput {
  saving: boolean;
  file: File | null;
  changeNote: string;
  onClose: () => void;
  onFileChange: (file: File | null) => void;
  onChangeNote: (value: string) => void;
  onSubmit: () => void;
}

export function createLibraryVersionUploadSection(input: LibraryVersionUploadSectionInput): BodySurfaceSectionSpec {
  return createAnalysisSection("library-version-upload", {
    title: "上传新版本",
    sections: [createFieldsSection<string>("library-version-upload-fields", [
      {
        key: "file", label: "新版本文件", hint: "仅替换文件内容；资料名称、文件夹和其他信息保持不变。",
        spec: { valueType: "file", control: "file", state: input.saving ? "disabled" : "required" },
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md", onChange: (value) => input.onFileChange(value instanceof File ? value : null),
      },
      {
        key: "changeNote", label: "变更说明", spec: { valueType: "string", control: "text", multiline: true, state: input.saving ? "disabled" : "normal" },
        value: input.changeNote, maxLength: 1000, rows: 3, autoGrow: true, onChange: (value) => input.onChangeNote(String(value ?? "")),
      },
    ], {
      layout: { columns: 1 },
      actions: [
        { key: "cancel", action: "cancel", label: "取消", disabled: input.saving, onClick: input.onClose },
        { key: "upload", action: "save", label: input.saving ? "上传中..." : "上传新版本", disabled: input.saving || !input.file, onClick: input.onSubmit },
      ],
    })],
  });
}
