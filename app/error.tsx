"use client";

import { useEffect } from "react";
import { createBlockSurfaceSection, createPageBody, createPanelSection, PageSurface } from "@workspace/core/ui";

export default function ErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    if (error.message === "SESSION_KICKED") {
      window.location.href = "/login?kicked=1";
    }
  }, [error]);

  if (error.message === "SESSION_KICKED") {
    return null;
  }

  return (
    <PageSurface kind="standard"
      body={createPageBody([
        createPanelSection("error", {
          title: "出错了",

          sections: [
            createBlockSurfaceSection("message", {
              kind: "empty",
              compact: true,
              content: <p className="text-gray-600">{error.message}</p>
            }),
          ],
        }),
      ])}
    />
  );
}
