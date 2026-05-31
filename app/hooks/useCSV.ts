"use client";

/** Reusable CSV export hook. Returns a download function. */
export function useCSV(filename: string, header: string, rows: () => string) {
  function exportCSV() {
    const blob = new Blob(["﻿" + header + rows()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  return exportCSV;
}

/** CSV file icon (vector) for buttons */
export function CSV_ICON(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2v6h6" />
      <text x="6" y="17" fill="currentColor" stroke="none" fontSize="5" fontWeight="700">CSV</text>
    </svg>
  );
}
