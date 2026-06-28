"use client";

import { useMemo } from "react";
import {
  createPageBody,
  PageSurface,
  createInlineFieldsBlock,
} from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import type { ProfileField } from "@workspace/hr/types";

interface AliasTagsInputProps {
  field: ProfileField;
  value: unknown;
  disabled?: boolean;
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void;
}

function normalizeAliasTags(tags: unknown[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of tags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

function readAliasTags(value: unknown) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? normalizeAliasTags(parsed) : [];
  } catch {
    return splitDraftTags(String(value));
  }
}

function splitDraftTags(value: string) {
  return normalizeAliasTags(value.split(/[,，、;；\n]+/));
}

function serializeAliasTags(tags: unknown[]) {
  const normalized = normalizeAliasTags(tags);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function AliasTagEditor({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const tags = useMemo(() => readAliasTags(value), [value]);

  function appendTags(values: string[]) {
    const nextTags = normalizeAliasTags(values);
    if (nextTags.length === 0) {
      return;
    }
    onChange(serializeAliasTags([...tags, ...nextTags]));
  }

  function removeTag(index: number) {
    onChange(serializeAliasTags(tags.filter((_, tagIndex) => tagIndex !== index)));
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      body={createPageBody([createInlineFieldsBlock<string>("aliases", [{
        kind: "tagList",
        key: "aliases",
        label: "",
        items: tags,
        getKey: (tag, index) => `${tag}-${index}`,
        getLabel: (tag) => tag,
        onRemove: (_, index) => removeTag(index),
        disabled,
        emptyText: disabled ? "未设置" : undefined,
        shellClassName: "content-start",
        fieldClassName: "w-full",
        append: disabled ? undefined : {
          textInput: {
            key: "aliasDraft",
            placeholder: tags.length === 0 ? "添加别名" : "",
            onAppend: appendTags,
            onRemoveLast: () => {
              if (tags.length > 0) removeTag(tags.length - 1);
            },
          },
        },
      }])])}
    />
  );
}

export function AliasTagsInput({
  field,
  value,
  disabled,
  onChange,
}: AliasTagsInputProps) {
  return (
    <AliasTagEditor
      value={value}
      disabled={disabled}
      onChange={(next) => onChange(field.key, next)}
    />
  );
}
