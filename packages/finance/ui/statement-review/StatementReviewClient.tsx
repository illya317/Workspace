"use client";

import { Suspense } from "react";
import ReviewClient from "./ReviewClient";

export default function StatementReviewClient({
  canCreate,
  canWrite,
  canApprove,
}: {
  canCreate: boolean;
  canWrite: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
        <ReviewClient canCreate={canCreate} canWrite={canWrite} canApprove={canApprove} />
      </Suspense>
    </div>
  );
}
