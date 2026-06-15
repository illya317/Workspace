"use client";

import { useState, useTransition } from "react";

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
      fetch(`/workspace/api/production/qc/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchNumber: value }),
      });
    });
  }

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      disabled={isPending}
      className="min-w-32 border-0 border-b border-slate-900 bg-white px-2 py-1 text-sm outline-none disabled:text-slate-400"
    />
  );
}
