"use client";

import { Suspense } from "react";
import { DatabasePageFrame } from "@workspace/core/ui";
import ReviewClient from "./ReviewClient";

export default function StatementReviewClient() {
  return (
    <DatabasePageFrame>
      <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
        <ReviewClient />
      </Suspense>
    </DatabasePageFrame>
  );
}
