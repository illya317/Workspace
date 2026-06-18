"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import ConfirmModal from "./ConfirmModal";

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
}

interface ConfirmRequest extends Required<Omit<ConfirmOptions, "message">> {
  message: ReactNode;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest({
      title: options.title ?? "请确认",
      message: options.message,
      confirmLabel: options.confirmLabel ?? "确定",
      cancelLabel: options.cancelLabel ?? "取消",
      confirmDanger: options.confirmDanger ?? false,
      resolve,
    });
  }), []);

  const confirmDelete = useCallback((options: Partial<ConfirmOptions> = {}) => confirm({
    title: options.title ?? "确认删除",
    message: options.message ?? "确定要删除这条记录吗？此操作不可撤销。",
    confirmLabel: options.confirmLabel ?? "删除",
    cancelLabel: options.cancelLabel ?? "取消",
    confirmDanger: options.confirmDanger ?? true,
  }), [confirm]);

  const value = useMemo(() => ({ confirm, confirmDelete }), [confirm, confirmDelete]);

  function close(confirmed: boolean) {
    const current = request;
    setRequest(null);
    current?.resolve(confirmed);
  }

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={!!request}
        title={request?.title ?? ""}
        message={request?.message}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        confirmDanger={request?.confirmDanger}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside ConfirmProvider");
  return context.confirm;
}

export function useConfirmDelete() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirmDelete must be used inside ConfirmProvider");
  return context.confirmDelete;
}
