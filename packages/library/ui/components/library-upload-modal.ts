import {
  createFieldsSection,
  createPageModalSection,
} from "@workspace/core/ui";
import type { BodySurfaceModalSpec, FormSurfaceItemSpec } from "@workspace/core/ui";
import type { DirectoryNode } from "@workspace/library/types";

import { LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS } from "./library-document-options";

function directoryOptions(nodes: DirectoryNode[]): Array<{ value: string; label: string }> {
  return nodes.flatMap((node) => [
    { value: node.path, label: node.path },
    ...directoryOptions(node.children),
  ]);
}

function directDirectoryOptions(nodes: DirectoryNode[]) {
  return nodes.map((node) => ({ value: node.path, label: node.name }));
}

function findDirectoryChain(nodes: DirectoryNode[], path: string): DirectoryNode[] {
  for (const node of nodes) {
    if (node.path === path) return [node];
    const descendants = findDirectoryChain(node.children, path);
    if (descendants.length > 0) return [node, ...descendants];
  }
  return [];
}

interface LibraryUploadModalInput {
  open: boolean;
  saving: boolean;
  file: File | null;
  title: string;
  summary: string;
  directoryPath: string;
  tags: string[];
  confidentialityLevel: string;
  directories: DirectoryNode[];
  directoriesLoading: boolean;
  onClose: () => void;
  onFileChange: (file: File | null) => void;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onDirectoryPathChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
  onConfidentialityLevelChange: (value: string) => void;
  onSubmit: () => void;
}

function uploadDirectoryFields(input: LibraryUploadModalInput): FormSurfaceItemSpec<string>[] {
  const chain = findDirectoryChain(input.directories, input.directoryPath);
  const selectedRoot = chain[0];
  const selectedSecond = chain[1];
  const disabled = input.saving || input.directoriesLoading;
  const fields: FormSurfaceItemSpec<string>[] = [{
    key: "directoryLevel1",
    label: "文件夹大类",
    spec: {
      valueType: "string",
      control: "choice",
      state: disabled ? "disabled" : "required",
      options: { source: "static", items: directDirectoryOptions(input.directories), visibleCount: 8, searchPlaceholder: "搜索大类" },
    },
    value: selectedRoot?.path ?? "",
    placeholder: input.directoriesLoading ? "正在加载文件夹..." : "选择大类",
    onChange: (value) => input.onDirectoryPathChange(String(value ?? "")),
  }];

  if (selectedRoot?.children.length) {
    fields.push({
      key: "directoryLevel2",
      label: "二级文件夹",
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: directDirectoryOptions(selectedRoot.children), visibleCount: 8, searchPlaceholder: "搜索二级文件夹" },
      },
      value: selectedSecond?.path ?? "",
      placeholder: "选择二级文件夹",
      onChange: (value) => input.onDirectoryPathChange(String(value ?? selectedRoot.path)),
    });
  }

  if (selectedSecond?.children.length) {
    fields.push({
      key: "directoryLevel3",
      label: "详细文件夹",
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: directoryOptions(selectedSecond.children), visibleCount: 8, searchPlaceholder: "搜索详细文件夹" },
      },
      value: chain.length >= 3 ? input.directoryPath : "",
      placeholder: "选择 L3 或更深文件夹",
      onChange: (value) => input.onDirectoryPathChange(String(value ?? selectedSecond.path)),
    });
  }

  return fields;
}

export function createLibraryUploadModal(input: LibraryUploadModalInput): BodySurfaceModalSpec {
  return createPageModalSection("library-upload", {
    open: input.open,
    title: "上传资料",
    onClose: input.onClose,
    size: "lg",
    actions: [
      { key: "cancel", label: "取消", disabled: input.saving, onClick: input.onClose },
      {
        key: "save",
        label: input.saving ? "处理中..." : "上传并处理",
        disabled: input.saving || !input.file || !input.title.trim() || !input.directoryPath,
        onClick: input.onSubmit,
      },
    ],
    sections: [createFieldsSection<string>("library-upload-fields", [
      {
        key: "file",
        label: "文件",
        spec: { valueType: "file", control: "file", state: input.saving ? "disabled" : "required" },
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md",
        onChange: (value) => input.onFileChange(value instanceof File ? value : null),
      },
      {
        key: "title",
        label: "标题",
        spec: { valueType: "string", control: "text", state: input.saving ? "disabled" : "required" },
        value: input.title,
        maxLength: 300,
        onChange: (value) => input.onTitleChange(String(value ?? "")),
      },
      ...uploadDirectoryFields(input),
      {
        key: "confidentialityLevel",
        label: "保密等级",
        spec: {
          valueType: "string",
          control: "choice",
          state: input.saving ? "disabled" : "normal",
          options: { source: "static", items: LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS },
        },
        value: input.confidentialityLevel,
        onChange: (value) => input.onConfidentialityLevelChange(String(value ?? "2")),
      },
      {
        key: "summary",
        label: "简介",
        spec: { valueType: "string", control: "text", multiline: true, state: input.saving ? "disabled" : "normal" },
        value: input.summary,
        rows: 2,
        autoGrow: true,
        onChange: (value) => input.onSummaryChange(String(value ?? "")),
        span: "wide",
      },
      {
        kind: "tagList",
        key: "tags",
        label: "标签",
        items: input.tags,
        getKey: (tag, index) => `${tag}-${index}`,
        getLabel: (tag) => tag,
        onRemove: (_, index) => input.onTagsChange(input.tags.filter((__, tagIndex) => tagIndex !== index)),
        disabled: input.saving,
        longTextMode: "wrap",
        append: input.saving ? undefined : {
          textInput: {
            key: "libraryUploadTagAppend",
            placeholder: input.tags.length === 0 ? "输入标签，回车添加" : "",
            splitPattern: /[,，、;；\n]+/,
            onAppend: (tags) => input.onTagsChange([...new Set([...input.tags, ...tags.map((tag) => tag.trim()).filter(Boolean)])]),
            onRemoveLast: () => input.onTagsChange(input.tags.slice(0, -1)),
          },
        },
        span: "wide",
      },
    ], {
      layout: { columns: 2 },
    })],
  });
}
