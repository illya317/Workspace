"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useTransition } from "react";
import { TextField } from "@workspace/core/ui";

interface Props {
  batchId: number;
  initialValue: string;
}

export default function QcBatchNumberInput({ batchId, initialValue }: Props) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (value.trim() === initialValue.trim()) return;
    startTransition(() => {
      fetch(workspacePath(`/api/modules/production/qc-batches/${batchId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchNumber: value }),
      });
    });
  }

  return (
    <TextField
      value={value}
      onChange={setValue}
      onBlur={save}
      disabled={isPending}
      unstyled
      className="min-w-32 border-0 border-b border-slate-900 bg-white px-2 py-1 text-sm outline-none disabled:text-slate-400"
    />
  );
}
