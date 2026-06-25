"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing/api-path";

const API_URL = workspacePath("/api/settings/ui-components/verified");

export function useUiComponentVerified() {
  const [verifiedNames, setVerifiedNames] = useState<Set<string>>(new Set());
  const [canWrite, setCanWrite] = useState<boolean>(false);

  useEffect(() => {
    fetch(API_URL, { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`加载失败 ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data.verified)) {
          setVerifiedNames(new Set(data.verified));
        }
        if (typeof data.canWrite === "boolean") {
          setCanWrite(data.canWrite);
        }
      })
      .catch((error) => {
        console.error("加载 verified 状态失败", error);
      });
  }, []);

  function toggleVerified(name: string) {
    if (!canWrite) return;

    let previous = new Set<string>();
    setVerifiedNames((prev) => {
      previous = prev;
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

    fetch(API_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `保存失败 ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.verified) {
          setVerifiedNames((prev) => new Set(prev).add(name));
        } else {
          setVerifiedNames((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }
      })
      .catch((error) => {
        console.error("保存 verified 状态失败", error);
        setVerifiedNames(previous);
      });
  }

  return { verifiedNames, toggleVerified, canWrite };
}
