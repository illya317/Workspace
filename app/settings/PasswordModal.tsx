"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DetailModal from "@/app/components/DetailModal";

interface PasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PasswordModal({ open, onClose }: PasswordModalProps) {
  const router = useRouter();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  useEffect(() => {
    if (open) {
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdError("");
      setPwdSuccess("");
    }
  }, [open]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (newPwd !== confirmPwd) {
      setPwdError("两次输入的新密码不一致");
      return;
    }

    const res = await fetch("/workspace/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    });

    const data = await res.json();
    if (!res.ok) {
      setPwdError(data.error || "修改失败");
      return;
    }

    setPwdSuccess("密码修改成功，请重新登录");
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setTimeout(() => {
      onClose();
      router.push("/login");
    }, 1500);
  }

  return (
    <DetailModal
      open={open}
      title="修改密码"
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">旧密码</label>
          <input
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">新密码</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
            minLength={4}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">确认新密码</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
            minLength={4}
          />
        </div>
        {pwdError && <p className="text-sm text-red-500">{pwdError}</p>}
        {pwdSuccess && <p className="text-sm text-emerald-600">{pwdSuccess}</p>}
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
