"use client";

import type { ComponentProps } from "react";
import { SettingsClient, type AccountWorkflowDetailRenderer } from "@workspace/platform/ui";
import WorkApprovalInboxDetail from "../works/WorkApprovalInboxDetail";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;
export type WorkAccountSettingsClientProps = Pick<SettingsClientProps, "user" | "apiAccessModules">;

const WorkWorkflowDetailRenderer: AccountWorkflowDetailRenderer = ({
  item,
  currentUserId,
  onChanged,
  onBack,
}) => {
  const requestId = item.workflow?.requestId;
  const resourceKey = item.workflow?.resourceKey ?? "";
  if (!requestId || !resourceKey.includes(".tasks")) return null;
  return (
    <WorkApprovalInboxDetail
      requestId={requestId}
      currentUserId={currentUserId}
      onChanged={onChanged}
      onBack={onBack}
    />
  );
};

export default function WorkAccountSettingsClient({
  user,
  apiAccessModules,
}: WorkAccountSettingsClientProps) {
  return (
    <SettingsClient
      user={user}
      hideShell
      apiAccessModules={apiAccessModules}
      workflowDetailRenderer={WorkWorkflowDetailRenderer}
    />
  );
}
