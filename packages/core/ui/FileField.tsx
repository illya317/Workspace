"use client";

import { useRef, useState } from "react";

export interface FileFieldProps {
  label?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  showFileName?: boolean;
  onChange: (file: File | null) => void;
}

export default function FileField({
  label,
  accept,
  disabled = false,
  className = "",
  inputClassName = "",
  showFileName = true,
  onChange,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileName(file?.name ?? "");
    onChange(file);
  }

  return (
    <div className={`block text-xs ${className}`}>
      {label && <span className="mb-1 block text-gray-500">{label}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={[
            "rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition",
            "hover:border-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
          inputClassName,
        ].filter(Boolean).join(" ")}
        >
          选择文件
        </button>
        {showFileName && fileName && <span className="max-w-full truncate text-sm text-slate-500">{fileName}</span>}
      </div>
    </div>
  );
}
