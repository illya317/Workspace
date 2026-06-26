"use client";

import type { ReactNode } from "react";
import FeedbackProvider, { useFeedback, type ConfirmOptions } from "./FeedbackProvider";

export type { ConfirmOptions };

export interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}

export function useConfirm() {
  return useFeedback().confirm;
}

export function useConfirmDelete() {
  return useFeedback().confirmDelete;
}
