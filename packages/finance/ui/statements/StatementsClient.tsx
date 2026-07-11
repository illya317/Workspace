"use client";

import { Suspense } from "react";
import ReportTab from "./ReportTab";

export default function StatementsClient() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
      <ReportTab />
    </Suspense>
  );
}
