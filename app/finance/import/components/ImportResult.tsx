"use client";

interface ImportResultProps {
  success: boolean;
  message: string;
}

export default function ImportResult({ success, message }: ImportResultProps) {
  return (
    <div
      className={`mb-6 rounded-lg p-4 text-sm ${
        success
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}
