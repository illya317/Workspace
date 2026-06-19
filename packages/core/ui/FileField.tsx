"use client";

export interface FileFieldProps {
  label?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  onChange: (file: File | null) => void;
}

export default function FileField({
  label,
  accept,
  disabled = false,
  className = "",
  inputClassName = "",
  onChange,
}: FileFieldProps) {
  return (
    <label className={`block text-xs ${className}`}>
      {label && <span className="mb-1 block text-gray-500">{label}</span>}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className={[
          "block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0",
          "file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-700",
          "hover:file:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-400",
          inputClassName,
        ].filter(Boolean).join(" ")}
      />
    </label>
  );
}
