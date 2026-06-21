"use client";

import { useMemo, useState } from "react";
import {
  TagRemoveButton,
  TextField,
  getTagInlineInputClassName,
  getTagInputShellClassName,
  getTagPillClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import type { ProfileField } from "@workspace/hr/types";

interface AliasTagsInputProps {
  field: ProfileField;
  value: unknown;
  disabled?: boolean;
  onChange: (key: string, value: unknown, option?: FkFieldOption) => void;
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
  const tags = useMemo(() => readAliasTags(value), [value]);

  function commitDraft() {
    const nextTags = splitDraftTags(draft);
    if (nextTags.length === 0) return;
    onChange(serializeAliasTags([...tags, ...nextTags]));
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(serializeAliasTags(tags.filter((_, tagIndex) => tagIndex !== index)));
  }

  return (
    <div className={getTagInputShellClassName()}>
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className={getTagPillClassName()}>
          <span className="truncate">{tag}</span>
          {!disabled && <TagRemoveButton label={`删除别名 ${tag}`} onClick={() => removeTag(index)} />}
        </span>
      ))}
      {disabled ? (
        tags.length === 0 ? <span className="text-slate-400">未设置</span> : null
      ) : (
        <TextField
          value={draft}
          onChange={setDraft}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
              if (draft.trim()) {
                event.preventDefault();
                commitDraft();
              }
            }
            if (event.key === "Backspace" && !draft && tags.length > 0) removeTag(tags.length - 1);
          }}
          placeholder={tags.length === 0 ? "添加别名" : ""}
          unstyled
          className={getTagInlineInputClassName()}
        />
      )}
    </div>
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
