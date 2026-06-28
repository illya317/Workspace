"use client";

import { useState, type FC } from "react";
import { TagListInput, TextField } from "../internal-ui";

function TagListInputPreview() {
  const [items, setItems] = useState(["重点项目", "GMP", "长期客户"]);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState("岗位 A");
  function add() {
    const next = draft.trim();
    if (!next || items.includes(next)) return;
    setItems((prev) => [...prev, next]);
    setDraft("");
  }
  return (
    <div className="max-w-md space-y-4">
      <TagListInput
        items={items}
        getKey={(item) => item}
        getLabel={(item) => item}
        onRemove={(_, index) => setItems((prev) => prev.filter((_, i) => i !== index))}
        confirmMessage={(item) => `确定删除标签「${item}」？`}
      >
        <TextField
          value={draft}
          onChange={setDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="输入后回车添加"
          unstyled
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0 text-sm leading-none text-slate-800 outline-none placeholder:text-slate-400"
        />
      </TagListInput>
      <TagListInput
        items={["禁用标签 A", "禁用标签 B"]}
        getKey={(item) => item}
        getLabel={(item) => item}
        disabled
      />
      <TagListInput
        items={["amber 项"]}
        getKey={(item) => item}
        getLabel={(item) => item}
        itemClassName={() => "!border-amber-200 !bg-amber-50 !text-amber-800"}
      />
      <TagListInput
        items={["岗位 A", "岗位 B", "岗位 C"]}
        getKey={(item) => item}
        getLabel={(item) => item}
        itemTitle={(item) => `跳转到 ${item}`}
        itemActionLabel={(item) => `跳转到 ${item}`}
        itemClassName={(item) => item === active ? "!border-emerald-300 !bg-emerald-50 !text-emerald-800" : "border-slate-300 bg-white"}
        onItemClick={(item) => setActive(item)}
      />
    </div>
  );
}

export const tagPreviewByName: Record<string, FC> = {
  TagListInput: TagListInputPreview,
};
