"use client";

import { useMemo } from "react";
import {
  createPageBody,
  PageSurface,
  createInlineFieldsSection,
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
  const tags = useMemo(() => splitAliasText(value), [value]);

  function appendTags(values: string[]) {
    const nextTags = values.flatMap(splitAliasText);
    if (nextTags.length === 0) {
      return;
    }
    onChange([...tags, ...nextTags].join("、"));
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, tagIndex) => tagIndex !== index).join("、"));
  }

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createInlineFieldsSection<string>("position-aliases", [{
        kind: "tagList",
        key: "positionAliases",
        label: "",
        items: tags,
        getKey: (tag, index) => `${tag}-${index}`,
        getLabel: (tag) => tag,
        onRemove: (_, index) => removeTag(index),
        onUpdateLabel: (_, index, next) => onChange(tags.map((tag, tagIndex) => tagIndex === index ? next : tag).join("、")),
        disabled,
        confirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
        emptyText: disabled ? "未设置" : undefined,
        shellClassName: "content-start",

        append: disabled ? undefined : {
          textInput: {
            key: "positionAliasDraft",
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
