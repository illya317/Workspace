"use client";

import { useMemo, useState } from "react";
import {
  TagRemoveButton,
  TextField,
  getTagInputShellClassName,
  getTagPillClassName,
  useConfirmDelete,
} from "@workspace/core/ui";
import { splitAliasText } from "./utils";

const tagInputShellClassName = getTagInputShellClassName("content-start");
const tagPillClassName = getTagPillClassName();

export default function PositionAliasTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const [draft, setDraft] = useState("");
  const tags = useMemo(() => splitAliasText(value), [value]);

  function commitDraft() {
    const nextTags = splitAliasText(draft);
    if (nextTags.length === 0) return;
    onChange([...tags, ...nextTags].join("、"));
    setDraft("");
  }

  async function removeTag(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除别名「${tags[index]}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(tags.filter((_, tagIndex) => tagIndex !== index).join("、"));
  }

  return (
    <div className={tagInputShellClassName}>
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className={tagPillClassName}>
          <span className="truncate">{tag}</span>
          {!disabled && (
            <TagRemoveButton
              label={`删除别名 ${tag}`}
              onClick={() => void removeTag(index)}
            />
          )}
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
            if (event.key === "Backspace" && !draft && tags.length > 0) {
              void removeTag(tags.length - 1);
            }
          }}
          placeholder={tags.length === 0 ? "添加别名" : ""}
          unstyled
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      )}
    </div>
  );
}
