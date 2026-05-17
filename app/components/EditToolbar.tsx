"use client";

import { useState, useRef, useEffect } from "react";

export interface EditToolbarProps {
  editMode: boolean;
  onStartEdit: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  versions?: Array<{ version: number; createdAt: string }>;
  currentVersion?: number;
  onSelectVersion?: (version: number) => void;
  canEdit?: boolean;
  editLabel?: string;
  saveLabel?: string;
  saving?: boolean;
}

export default function EditToolbar({
  editMode,
  onStartEdit,
  onSave,
  onCancel,
  versions,
  currentVersion,
  onSelectVersion,
  canEdit = true,
  editLabel = "编辑",
  saveLabel = "保存",
  saving = false,
}: EditToolbarProps) {
  const [showVersions, setShowVersions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVersions(false);
      }
    }
    if (showVersions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showVersions]);

  if (!canEdit) return null;

  return (
    <div className="flex items-center gap-2">
      {!editMode ? (
        <button
          onClick={onStartEdit}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {editLabel}
        </button>
      ) : (
        <>
          <button
            onClick={async () => { await onSave(); onCancel(); }}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saveLabel}
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          {onSelectVersion && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowVersions(!showVersions)}
                className={`inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm ${
                  currentVersion && currentVersion > 0 ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                版本
                <svg className={`h-3 w-3 transition-transform ${showVersions ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {showVersions && (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-1">
                    <button
                      onClick={() => { onSelectVersion(0); setShowVersions(false); }}
                      className={`w-full rounded px-3 py-1.5 text-left text-xs ${!currentVersion || currentVersion === 0 ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      当前版本
                    </button>
                    {(!versions || versions.length === 0) && (
                      <div className="px-3 py-2 text-xs text-gray-400">暂无编辑历史</div>
                    )}
                    {(versions || []).map((v) => (
                      <button
                        key={v.version}
                        onClick={() => { onSelectVersion(v.version); setShowVersions(false); }}
                        className={`w-full rounded px-3 py-1.5 text-left text-xs ${currentVersion === v.version ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        V{v.version}
                        <span className="ml-2 text-gray-400">{new Date(v.createdAt).toLocaleDateString("zh-CN")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
