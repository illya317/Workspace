"use client";

import { useEffect, useRef } from "react";
import { workspacePath } from "@workspace/core/routing";

const VERSION_STORAGE_KEY = "workspace-app-version";
const RELOAD_STORAGE_KEY = "workspace-app-version-reload";

export default function AppVersionGuard({ version }: { version: string }) {
  const currentVersionRef = useRef(version);

  useEffect(() => {
    currentVersionRef.current = version;
    window.localStorage.setItem(VERSION_STORAGE_KEY, version);

    async function checkVersion() {
      try {
        const response = await fetch(workspacePath(`/api/settings/version?t=${Date.now()}`), { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { version?: string };
        const nextVersion = payload.version;
        if (!nextVersion || nextVersion === currentVersionRef.current) {
          window.sessionStorage.removeItem(RELOAD_STORAGE_KEY);
          return;
        }
        if (window.sessionStorage.getItem(RELOAD_STORAGE_KEY) === nextVersion) return;

        window.localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
        window.sessionStorage.setItem(RELOAD_STORAGE_KEY, nextVersion);
        const url = new URL(window.location.href);
        url.searchParams.set("__v", nextVersion);
        window.location.replace(url.toString());
      } catch {
        // A failed version check should not interrupt normal work.
      }
    }

    void checkVersion();
    return () => {
    };
  }, [version]);

  return null;
}
