"use client";

import { useState, type FC } from "react";
import {
  ActionButton,
  Toast,
} from "@workspace/core/ui";

function ToastPreview() {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <ActionButton kind="check" label="显示成功提示" variant="primary" onClick={() => setShow(true)} />
      <Toast message="保存成功" show={show} onClose={() => setShow(false)} />
    </div>
  );
}

export const feedbackPreviewByName: Record<string, FC> = {
  Toast: ToastPreview,
};
