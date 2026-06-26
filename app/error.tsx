"use client";

import { useEffect } from "react";
import { PageSurface } from "@workspace/core/ui";

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
      blocks={[
        {
          kind: "panel",
          key: "error",
          title: "出错了",
          bodyClassName: "p-8 pt-4 text-center",
          blocks: [
            {
              kind: "empty",
              key: "message",
              compact: true,
              content: <p className="text-gray-600">{error.message}</p>,
            },
          ],
        },
      ]}
    />
  );
}
