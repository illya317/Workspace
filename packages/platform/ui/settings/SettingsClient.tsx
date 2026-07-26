"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback } from "react";
import type { SessionUser } from "@workspace/platform/types";
import AccountSettingsPanel from "./AccountSettingsPanel";
import type { ApiAccessModuleRow } from "./ApiAccessClient";
import type { AccountWorkflowDetailRenderer } from "./AccountNotificationsPanel";

export default function SettingsClient({
  user: initialUser,
  apiAccessModules = [],
  workflowDetailRenderer,
}: {
  user: SessionUser;
  hideShell?: boolean;
  apiAccessModules?: ApiAccessModuleRow[];
  workflowDetailRenderer?: AccountWorkflowDetailRenderer;
}) {
  const [user, setUser] = useState<SessionUser>(initialUser);

  const refreshUser = useCallback(() => {
    fetch(workspacePath("/api/auth/me"))
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return <AccountSettingsPanel user={user} onUserRefresh={refreshUser} apiAccessModules={apiAccessModules} workflowDetailRenderer={workflowDetailRenderer} />;
}
