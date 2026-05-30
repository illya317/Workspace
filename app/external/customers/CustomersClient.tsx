"use client";

import { useState } from "react";
import type { Customer } from "../types";

export default function CustomersClient() {
  const [_customers, _setCustomers] = useState<Customer[]>([]);
  const [_loading, _setLoading] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* TODO: SearchBox + Add button toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">客户列表</h2>
        <button disabled className="rounded-lg bg-emerald-500 px-4 py-2 text-sm text-white opacity-50">
          新增客户
        </button>
      </div>

      {/* TODO: Table + pagination */}
      <div className="rounded-lg bg-white py-16 text-center shadow-sm">
        <p className="text-gray-400">暂无客户数据</p>
      </div>
    </main>
  );
}
