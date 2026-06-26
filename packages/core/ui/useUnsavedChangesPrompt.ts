"use client";

import { useFeedback } from "./FeedbackProvider";

export function useUnsavedChangesPrompt(
  enabled: boolean,
  options: {
    title?: string;
    message?: string;
  } = {},
) {
  return useFeedback({
    unsavedChanges: enabled,
    unsavedPrompt: options,
  }).confirmLeave;
}
