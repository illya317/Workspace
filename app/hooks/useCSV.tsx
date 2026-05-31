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
