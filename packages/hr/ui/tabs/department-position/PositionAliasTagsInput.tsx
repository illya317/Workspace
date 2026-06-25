"use client";

import { useMemo, useState } from "react";
import {
  TagListInput,
  TextField,
} from "@workspace/core/ui";
import { splitAliasText } from "./utils";

export default function PositionAliasTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const tags = useMemo(() => splitAliasText(value), [value]);

  function commitDraft() {
    const nextTags = splitAliasText(draft);
    if (nextTags.length === 0) return;
    onChange([...tags, ...nextTags].join("、"));
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, tagIndex) => tagIndex !== index).join("、"));
  }

  return (
    <TagListInput
      items={tags}
      getKey={(tag, index) => `${tag}-${index}`}
      getLabel={(tag) => tag}
      onRemove={(_, index) => removeTag(index)}
      disabled={disabled}
      confirmMessage={(tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`}
      emptyText={disabled ? "未设置" : undefined}
      shellClassName="content-start"
    >
      {!disabled && (
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
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      )}
    </TagListInput>
  );
}
