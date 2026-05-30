"use client";

import { useState } from "react";
import type { Investor } from "../types";

export default function InvestorsClient() {
  const [_investors, _setInvestors] = useState<Investor[]>([]);
  const [_loading, _setLoading] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">投资人列表</h2>
        <button disabled className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white opacity-50">
          新增投资人
        </button>
      </div>

      <div className="rounded-lg bg-white py-16 text-center shadow-sm">
        <p className="text-gray-400">暂无投资人数据</p>
      </div>
    </main>
  );
}
