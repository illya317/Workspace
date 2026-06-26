"use client";

import { useMemo, useState } from "react";
import {
  FormSurface,
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
  const [editing, setEditing] = useState(false);
  const tags = useMemo(() => splitAliasText(value), [value]);

  function commitDraft() {
    const nextTags = splitAliasText(draft);
    if (nextTags.length === 0) {
      setEditing(false);
      return;
    }
    onChange([...tags, ...nextTags].join("、"));
    setDraft("");
    setEditing(false);
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, tagIndex) => tagIndex !== index).join("、"));
  }

  return (
    <FormSurface<string>
      kind="inline"
      fields={[
        {
          kind: "tagList",
          key: "positionAliases",
          label: "",
          items: tags,
          getKey: (tag, index) => `${tag}-${index}`,
          getLabel: (tag) => tag,
          onRemove: (_, index) => removeTag(index),
          disabled,
          confirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
          emptyText: disabled ? "未设置" : undefined,
          shellClassName: "content-start",
          fieldClassName: "w-full",
          append: disabled
            ? undefined
            : editing
              ? {
                  field: {
                    key: "positionAliasDraft",
                    label: "",
                    spec: { valueType: "string", editor: "input" },
                    value: draft,
                    autoFocus: true,
                    onChange: (value) => setDraft(String(value ?? "")),
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
                    key: "addPositionAlias",
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
