"use client";

import { useMemo, useState } from "react";
import {
  FormSurface,
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
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const tags = useMemo(() => readAliasTags(value), [value]);

  function commitDraft() {
    const nextTags = splitDraftTags(draft);
    if (nextTags.length === 0) {
      setEditing(false);
      return;
    }
    onChange(serializeAliasTags([...tags, ...nextTags]));
    setDraft("");
    setEditing(false);
  }

  function removeTag(index: number) {
    onChange(serializeAliasTags(tags.filter((_, tagIndex) => tagIndex !== index)));
  }

  return (
    <FormSurface<string>
      kind="inline"
      fields={[
        {
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
          append: disabled
            ? undefined
            : editing
              ? {
                  field: {
                    key: "aliasDraft",
                    label: "",
                    spec: { valueType: "string", editor: "input" },
                    value: draft,
                    autoFocus: true,
                    onChange: (next) => setDraft(String(next ?? "")),
                    onBlur: commitDraft,
                    onKeyDown: (event) => {
                      if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
                        if (draft.trim()) {
                          event.preventDefault();
                          commitDraft();
                        }
                      }
                      if (event.key === "Escape") {
                        setDraft("");
                        setEditing(false);
                      }
                      if (event.key === "Backspace" && !draft && tags.length > 0) removeTag(tags.length - 1);
                    },
                    placeholder: tags.length === 0 ? "添加别名" : "",
                    density: "compact",
                  },
                }
              : {
                  action: {
                    key: "addAlias",
                    label: "+",
                    onClick: () => setEditing(true),
                    size: "sm",
                    className: "!size-7 !rounded-full !border-slate-200 !bg-slate-50 !p-0 text-base font-semibold leading-none !text-slate-700 hover:!border-slate-300 hover:!bg-slate-100",
                  },
                },
        },
      ]}
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
