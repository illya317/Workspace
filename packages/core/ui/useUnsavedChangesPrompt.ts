"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConfirm } from "./ConfirmProvider";

const defaultTitle = "有未保存修改";
const defaultMessage = "当前页面有未保存内容，离开后未保存的修改将丢失。确定离开吗？";

export function useUnsavedChangesPrompt(
  enabled: boolean,
  options: {
    title?: string;
    message?: string;
  } = {},
) {
  const confirm = useConfirm();
  const enabledRef = useRef(enabled);
  const title = options.title ?? defaultTitle;
  const message = options.message ?? defaultMessage;

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  return useCallback(async () => {
    if (!enabledRef.current) return true;
    return confirm({
      title,
      message,
      confirmLabel: "离开",
      cancelLabel: "继续编辑",
      confirmDanger: true,
    });
  }, [confirm, message, title]);
}
