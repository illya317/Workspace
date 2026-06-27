"use client";

import { useMemo, useState } from "react";
import type { ConfirmOptions } from "./FeedbackProvider";
import RemovableTag from "./RemovableTag";
import TagInlineTextField from "./TagInlineTextField";
import TagInputShell, { type TagInputShellProps } from "./TagInputShell";
import type { FieldControlSize } from "./FormStyles";

const DEFAULT_DELIMITER = /[,，、;；\n]+/;
const DELIMITER_KEYS = new Set([",", "，", "、", ";", "；"]);

function splitTags(value: string) {
  return [...new Set(value.split(DEFAULT_DELIMITER).map((item) => item.trim()).filter(Boolean))];
}

export interface TagStringInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  confirmDelete?: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  confirmRemove?: boolean;
  removeConfirmMessage?: (item: string) => string;
  removeConfirmTitle?: string;
  size?: FieldControlSize;
  density?: TagInputShellProps["density"];
}

export default function TagStringInput({
  value,
  onChange,
  disabled,
  placeholder = "添加别名",
  className,
  confirmDelete,
  confirmRemove = false,
  removeConfirmMessage,
  removeConfirmTitle,
  size = "md",
  density = "normal",
}: TagStringInputProps) {
  const [input, setInput] = useState("");
  const items = useMemo(() => splitTags(value), [value]);

  function addTags() {
    const next = input.trim();
    if (!next) return;
    const all = [...items, ...splitTags(next)];
    onChange([...new Set(all)].join("、"));
    setInput("");
  }

  function removeTag(index: number) {
    const next = [...items];
    next.splice(index, 1);
    onChange(next.join("、"));
  }

  return (
    <TagInputShell disabled={disabled} size={size} density={density} className={className}>
      {items.map((item, index) => (
        <RemovableTag
          key={`${item}-${index}`}
          label={`删除 ${item}`}
          title={item}
          disabled={disabled}
          confirmDelete={confirmDelete}
          confirmRemove={confirmRemove}
          removeConfirmMessage={removeConfirmMessage?.(item) ?? `确定删除「${item}」吗？`}
          removeConfirmTitle={removeConfirmTitle}
          onRemove={() => removeTag(index)}
        >
          {item}
        </RemovableTag>
      ))}
      <TagInlineTextField
        value={input}
        disabled={disabled}
        onChange={setInput}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Tab" || DELIMITER_KEYS.has(event.key)) {
            if (input.trim()) {
              event.preventDefault();
              addTags();
            }
          }
        }}
        onBlur={addTags}
        placeholder={items.length === 0 ? placeholder : ""}
      />
    </TagInputShell>
  );
}
