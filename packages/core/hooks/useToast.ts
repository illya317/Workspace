"use client";

import { useCallback } from "react";
import { useFeedback, type FeedbackToastState, type FeedbackToastType } from "../ui/FeedbackProvider";

export type ToastState = FeedbackToastState;

export function useToast() {
  const feedback = useFeedback();

  const showToast = useCallback((message: string, type: FeedbackToastType = "success") => {
    feedback.notify(message, type);
  }, [feedback]);

  return { toast: feedback.toast, showToast, closeToast: feedback.closeToast };
}
