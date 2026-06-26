"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useTransition } from "react";
import { InputControl } from "@workspace/core/ui";

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
    <InputControl
      spec={{ valueType: "string", editor: "input", state: isPending ? "disabled" : "normal" }}
      value={value}
      onChange={(next) => setValue(String(next ?? ""))}
      onBlur={save}
    />
  );
}
