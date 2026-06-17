"use client";

export default function InlineFeedbackMarkerButton({
  tone,
  onClick,
}: {
  tone: "saved" | "hover";
  onClick: () => void;
}) {
  const saved = tone === "saved";
  return (
    <button
      type="button"
      className={[
        "flex h-6 w-6 items-center justify-center rounded-full border shadow-md backdrop-blur-sm transition",
        saved
          ? "border-amber-500 bg-amber-100/95 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200"
          : "border-sky-500 bg-sky-100/95 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-200",
      ].join(" ")}
      onClick={onClick}
      aria-label={saved ? "查看字段反馈" : "添加字段反馈"}
      title={saved ? "查看字段反馈" : "添加字段反馈"}
    >
      <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h8M8 14h5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9 9 0 10-7.2-3.6L4 21l3.6-.8A8.96 8.96 0 0012 21z" />
      </svg>
    </button>
  );
}
