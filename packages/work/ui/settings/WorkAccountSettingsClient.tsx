"use client";

import type { ComponentProps } from "react";
import { SettingsClient, type AccountWorkflowDetailRenderer } from "@workspace/platform/ui";
import WorkApprovalInboxDetail from "../works/WorkApprovalInboxDetail";
import WorkProjectApprovalInboxDetail from "../project/WorkProjectApprovalInboxDetail";

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
  if (!requestId) return null;
  if (resourceKey.includes(".projects")) {
    return (
      <WorkProjectApprovalInboxDetail
        requestId={requestId}
        currentUserId={currentUserId}
        onChanged={onChanged}
        onBack={onBack}
      />
    );
  }
  if (!resourceKey.includes(".tasks")) return null;
  return (
    <WorkApprovalInboxDetail
      requestId={requestId}
      currentUserId={currentUserId}
      onChanged={onChanged}
      onBack={onBack}
    />
  );
};

WorkWorkflowDetailRenderer.supports = (item) => {
  const resourceKey = item.workflow?.resourceKey ?? "";
  return resourceKey.includes(".tasks") || resourceKey.includes(".projects");
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
