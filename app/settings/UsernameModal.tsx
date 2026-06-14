"use client";

import { useState, useEffect } from "react";
import DetailModal from "@/app/components/DetailModal";
import { SessionUser } from "@/lib/types";

interface UsernameModalProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  onSuccess?: () => void;
}

export default function UsernameModal({ open, onClose, user, onSuccess }: UsernameModalProps) {
  const [newUsername, setNewUsername] = useState("");
  const [unameError, setUnameError] = useState("");
  const [unameSuccess, setUnameSuccess] = useState("");

  useEffect(() => {
    if (open) {
      setNewUsername("");
      setUnameError("");
      setUnameSuccess("");
    }
  }, [open]);

  async function handleChangeUsername(e: React.FormEvent) {
    e.preventDefault();
    setUnameError("");
    setUnameSuccess("");
    if (!newUsername.trim()) { setUnameError("用户名不能为空"); return; }
    const res = await fetch("/workspace/api/admin/users/" + user.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "username", value: newUsername.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setUnameError(data.error || "修改失败"); return; }
    setUnameSuccess("用户名已修改");
    setNewUsername("");
    setTimeout(() => {
      onClose();
      onSuccess?.();
    }, 800);
  }

  return (
    <DetailModal
      open={open}
      title="修改账号"
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleChangeUsername} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">当前用户名</label>
          <p className="text-base text-gray-700">{user?.username || "(未设置)"}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">新用户名</label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
            autoFocus
          />
        </div>
        {unameError && <p className="text-sm text-red-500">{unameError}</p>}
        {unameSuccess && <p className="text-sm text-emerald-600">{unameSuccess}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            确认
          </button>
        </div>
      </form>
    </DetailModal>
  );
}
