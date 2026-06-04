"use client";

export interface MaterialItem {
  id: number;
  selected: boolean;
  matchScore: number | null;
  reason: string | null;
  document: {
    title: string | null;
    fileName: string;
    categoryName: string | null;
    confidentialityLevel: number;
  };
}

export interface QuestionItem {
  id: number;
  questionText: string;
  status: string;
  materials: MaterialItem[];
}

interface Props {
  index: number;
  question: QuestionItem;
  onToggle: (selectionId: number, selected: boolean) => void;
}

export default function QuestionCard({ index, question, onToggle }: Props) {
  const hasMatches = question.materials.length > 0;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">Q{index}</span>
        <div className="text-sm text-gray-800">{question.questionText}</div>
      </div>

      {!hasMatches ? (
        <div className="py-2 text-xs text-gray-400">尚未运行材料匹配</div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {question.materials.map((m) => (
            <div
              key={m.id}
              onClick={() => onToggle(m.id, !m.selected)}
              className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-sm transition ${
                m.selected
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-100 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={() => {}}
                  className="pointer-events-none h-4 w-4 accent-emerald-600"
                />
                <span className="text-gray-800">{m.document.title || m.document.fileName}</span>
                {m.document.categoryName && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{m.document.categoryName}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {m.matchScore !== null && (
                  <span className="text-xs text-gray-400">匹配度 {m.matchScore.toFixed(1)}</span>
                )}
                <ConfidentialityBadge level={m.document.confidentialityLevel} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidentialityBadge({ level }: { level: number }) {
  const labels: Record<number, string> = { 0: "公开", 1: "内部", 2: "普通", 3: "机密", 4: "绝密" };
  const colors: Record<number, string> = {
    0: "bg-blue-100 text-blue-700",
    1: "bg-blue-100 text-blue-700",
    2: "bg-green-100 text-green-700",
    3: "bg-orange-100 text-orange-700",
    4: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors[level] || "bg-gray-100 text-gray-600"}`}>
      {labels[level] || `L${level}`}
    </span>
  );
}
