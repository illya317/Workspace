"use client";

import { useEffect } from "react";
import { PanelCard } from "@workspace/core/ui";

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <PanelCard title="出错了" bodyClassName="p-8 pt-4 text-center">
        <p className="text-gray-600">{error.message}</p>
      </PanelCard>
    </div>
  );
}
