"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback } from "react";
import type { SessionUser } from "@workspace/platform/types";
import AccountSettingsPanel from "./AccountSettingsPanel";
import type { ApiAccessModuleRow } from "./ApiAccessClient";

export default function SettingsClient({
  user: initialUser,
  apiAccessModules = [],
}: {
  user: SessionUser;
  hideShell?: boolean;
  apiAccessModules?: ApiAccessModuleRow[];
}) {
  const [user, setUser] = useState<SessionUser>(initialUser);

  const refreshUser = useCallback(() => {
    fetch(workspacePath("/api/auth/me"))
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return <AccountSettingsPanel user={user} onUserRefresh={refreshUser} apiAccessModules={apiAccessModules} />;
}
