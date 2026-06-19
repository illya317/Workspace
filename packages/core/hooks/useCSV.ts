"use client";

export function useCSV(filename: string, header: string, rows: () => string) {
  function exportCSV() {
    const blob = new Blob([`\uFEFF${header}${rows()}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return exportCSV;
}
