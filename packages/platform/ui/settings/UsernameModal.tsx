"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";
import { ActionToolbar, FormField, TextField } from "@workspace/core/ui";
import DetailModal from "@workspace/core/ui/DetailModal";
import type { SessionUser } from "@workspace/platform/types";

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

  async function handleChangeUsername() {
    setUnameError("");
    setUnameSuccess("");
    if (!newUsername.trim()) { setUnameError("用户名不能为空"); return; }
    const res = await fetch(workspacePath("/api/system/admin/users/") + user.id, {
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
      <div className="space-y-4">
        <FormField label="当前用户名">
          <p className="text-base text-gray-700">{user?.username || "(未设置)"}</p>
        </FormField>
        <FormField label="新用户名" required>
          <TextField
            type="text"
            value={newUsername}
            onChange={setNewUsername}
            required
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleChangeUsername();
            }}
          />
        </FormField>
        {unameError && <p className="text-sm text-red-500">{unameError}</p>}
        {unameSuccess && <p className="text-sm text-emerald-600">{unameSuccess}</p>}
        <ActionToolbar
          className="justify-end border-0 p-0 pt-2 shadow-none"
          secondaryActions={[{ label: "取消", onClick: onClose }]}
          primaryActions={[{ label: "确认", onClick: () => void handleChangeUsername() }]}
        />
      </div>
    </DetailModal>
  );
}
