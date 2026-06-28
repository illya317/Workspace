"use client";

import { useEffect } from "react";
import { createBlockSurfaceBlock, createPageBody, createPanelBlock, PageSurface } from "@workspace/core/ui";

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
    <PageSurface
      kind="detail"
      contentClassName="flex min-h-screen items-center justify-center bg-gray-50"
      className="w-full max-w-md"
      body={createPageBody([
        createPanelBlock("error", {
          title: "出错了",
          bodyClassName: "p-8 pt-4 text-center",
          blocks: [
            createBlockSurfaceBlock("message", {
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
