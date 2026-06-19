"use client";

import { PanelCard, SelectorCard, StatusBadge, type StatusBadgeProps } from "@workspace/core/ui";

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
    <PanelCard bodyClassName="p-4">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">Q{index}</span>
        <div className="text-sm text-gray-800">{question.questionText}</div>
      </div>

      {!hasMatches ? (
        <div className="py-2 text-xs text-gray-400">尚未运行材料匹配</div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {question.materials.map((m) => (
            <SelectorCard
              key={m.id}
              onClick={() => onToggle(m.id, !m.selected)}
              title={m.document.title || m.document.fileName}
              meta={m.document.categoryName ? [m.document.categoryName] : []}
              trailing={(
                <div className="flex items-center gap-2">
                  {m.matchScore !== null && (
                    <span className="text-xs text-gray-400">匹配度 {m.matchScore.toFixed(1)}</span>
                  )}
                  <ConfidentialityBadge level={m.document.confidentialityLevel} />
                </div>
              )}
              active={m.selected}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function ConfidentialityBadge({ level }: { level: number }) {
  const labels: Record<number, string> = { 0: "公开", 1: "内部", 2: "普通", 3: "机密", 4: "绝密" };
  const variants: Record<number, StatusBadgeProps["variant"]> = {
    0: "blue",
    1: "blue",
    2: "green",
    3: "yellow",
    4: "red",
  };
  return <StatusBadge label={labels[level] || `L${level}`} variant={variants[level] || "gray"} />;
}
