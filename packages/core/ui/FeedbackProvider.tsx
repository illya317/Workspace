"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ConfirmModal from "./ConfirmModal";
import Toast from "./Toast";

export type FeedbackToastType = "success" | "error";

export interface FeedbackToastOptions {
  duration?: number;
  title?: string;
}

export interface FeedbackToastState {
  message: string;
  type: FeedbackToastType;
  duration?: number;
  title?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  showCancel?: boolean;
}

export interface FeedbackHookOptions {
  unsavedChanges?: boolean;
  unsavedPrompt?: {
    title?: string;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmDanger?: boolean;
  };
}

export interface FeedbackApi {
  toast: FeedbackToastState | null;
  notify: (message: string, type?: FeedbackToastType, options?: FeedbackToastOptions) => void;
  success: (message: string, options?: FeedbackToastOptions) => void;
  error: (message: string, options?: FeedbackToastOptions) => void;
  closeToast: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  confirmLeave: () => Promise<boolean>;
}

type FeedbackContextValue = Omit<FeedbackApi, "confirmLeave">;

type ConfirmOverlay = {
  kind: "confirm";
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  confirmDanger: boolean;
  showCancel: boolean;
  resolve: (confirmed: boolean) => void;
};

type ErrorOverlay = {
  kind: "error";
  title: string;
  message: ReactNode;
};

type FeedbackOverlay = ConfirmOverlay | ErrorOverlay;

const defaultUnsavedTitle = "有未保存修改";
const defaultUnsavedMessage = "当前页面有未保存内容，离开后未保存的修改将丢失。确定离开吗？";

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export default function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<FeedbackToastState | null>(null);
  const [overlay, setOverlay] = useState<FeedbackOverlay | null>(null);
  const overlayRef = useRef<FeedbackOverlay | null>(null);
  const overlayQueueRef = useRef<FeedbackOverlay[]>([]);

  const openOverlay = useCallback((nextOverlay: FeedbackOverlay) => {
    if (overlayRef.current) {
      overlayQueueRef.current.push(nextOverlay);
      return;
    }
    overlayRef.current = nextOverlay;
    setOverlay(nextOverlay);
  }, []);

  const closeOverlay = useCallback(() => {
    const nextOverlay = overlayQueueRef.current.shift() ?? null;
    overlayRef.current = nextOverlay;
    setOverlay(nextOverlay);
  }, []);

  const notify = useCallback((message: string, type: FeedbackToastType = "success", options: FeedbackToastOptions = {}) => {
    if (type === "error") {
      openOverlay({
        kind: "error",
        title: options.title ?? "操作失败",
        message,
      });
      return;
    }
    setToast({ message, type, duration: options.duration, title: options.title });
  }, [openOverlay]);

  const success = useCallback((message: string, options?: FeedbackToastOptions) => {
    notify(message, "success", options);
  }, [notify]);

  const error = useCallback((message: string, options?: FeedbackToastOptions) => {
    notify(message, "error", options);
  }, [notify]);

  const closeToast = useCallback(() => setToast(null), []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    openOverlay({
      kind: "confirm",
      title: options.title ?? "请确认",
      message: options.message,
      confirmLabel: options.confirmLabel ?? "确定",
      cancelLabel: options.cancelLabel ?? "取消",
      confirmDanger: options.confirmDanger ?? false,
      showCancel: options.showCancel ?? true,
      resolve,
    });
  }), [openOverlay]);

  const confirmDelete = useCallback((options: Partial<ConfirmOptions> = {}) => confirm({
    title: options.title ?? "确认删除",
    message: options.message ?? "确定要删除这条记录吗？此操作不可撤销。",
    confirmLabel: options.confirmLabel ?? "删除",
    cancelLabel: options.cancelLabel ?? "取消",
    confirmDanger: options.confirmDanger ?? true,
    showCancel: options.showCancel ?? true,
  }), [confirm]);

  const value = useMemo<FeedbackContextValue>(() => ({
    toast,
    notify,
    success,
    error,
    closeToast,
    confirm,
    confirmDelete,
  }), [closeToast, confirm, confirmDelete, error, notify, success, toast]);

  function resolveConfirm(confirmed: boolean) {
    const current = overlayRef.current;
    if (current?.kind === "confirm") current.resolve(confirmed);
    closeOverlay();
  }

  function closeError() {
    closeOverlay();
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toast
        message={toast?.message ?? ""}
        type={toast?.type}
        show={!!toast}
        onClose={closeToast}
        duration={toast?.duration}
        title={toast?.title}
      />
      {overlay?.kind === "confirm" ? (
        <ConfirmModal
          open
          title={overlay.title}
          message={overlay.message}
          confirmLabel={overlay.confirmLabel}
          cancelLabel={overlay.cancelLabel}
          confirmDanger={overlay.confirmDanger}
          showCancel={overlay.showCancel}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      ) : overlay?.kind === "error" ? (
        <ConfirmModal
          open
          title={overlay.title}
          message={overlay.message}
          confirmLabel="关闭"
          confirmDanger
          showCancel={false}
          onConfirm={closeError}
          onCancel={closeError}
        />
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(options: FeedbackHookOptions = {}): FeedbackApi {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used inside FeedbackProvider");

  const unsavedChanges = options.unsavedChanges ?? false;
  const unsavedChangesRef = useRef(unsavedChanges);
  const unsavedPrompt = options.unsavedPrompt;

  useEffect(() => {
    unsavedChangesRef.current = unsavedChanges;
  }, [unsavedChanges]);

  useEffect(() => {
    if (!unsavedChanges) return undefined;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unsavedChanges]);

  const confirmLeave = useCallback(async () => {
    if (!unsavedChangesRef.current) return true;
    return context.confirm({
      title: unsavedPrompt?.title ?? defaultUnsavedTitle,
      message: unsavedPrompt?.message ?? defaultUnsavedMessage,
      confirmLabel: unsavedPrompt?.confirmLabel ?? "离开",
      cancelLabel: unsavedPrompt?.cancelLabel ?? "继续编辑",
      confirmDanger: unsavedPrompt?.confirmDanger ?? true,
    });
  }, [context, unsavedPrompt]);

  return useMemo(() => ({
    ...context,
    confirmLeave,
  }), [confirmLeave, context]);
}
