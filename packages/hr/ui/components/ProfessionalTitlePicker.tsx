"use client";

import { useMemo, useState } from "react";
import { PickerShell } from "@workspace/core/ui";
import {
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";

interface ProfessionalTitlePickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

function findTitle(value: unknown) {
  const normalized = normalizeProfessionalTitle(value);
  if (!normalized) return null;
  for (const group of HR_PROFESSIONAL_TITLE_GROUPS) {
    const level = group.levels.find((item) => item.title === normalized);
    if (level) return { group, level };
  }
  return null;
}

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: ProfessionalTitlePickerProps) {
  const current = useMemo(() => findTitle(value), [value]);
  const [activeSeries, setActiveSeries] = useState(current?.group.series || "");
  const [step, setStep] = useState<"series" | "level">("series");

  const activeGroup = HR_PROFESSIONAL_TITLE_GROUPS.find((group) => group.series === activeSeries);

  function choose(title: string | null, close: () => void) {
    onChange(title);
    close();
    setStep("series");
  }

  return (
    <PickerShell
      valueLabel={current?.level.title}
      disabled={disabled}
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(30rem,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
      onOpenChange={(open) => {
        if (!open) return;
        setActiveSeries(current?.group.series || "");
        setStep(current?.group.series ? "level" : "series");
      }}
    >
      {({ close }) => (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => choose(null, close)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                current
                  ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "border-slate-300 bg-slate-100 text-slate-900"
              }`}
            >
              未设置
            </button>
            {step === "level" && (
              <button
                type="button"
                onClick={() => setStep("series")}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                更换职称系列
              </button>
            )}
          </div>

          {step === "series" ? (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">职称系列</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {HR_PROFESSIONAL_TITLE_GROUPS.map((group) => {
                  const selected = group.series === activeSeries;
                  return (
                    <button
                      key={group.series}
                      type="button"
                      onClick={() => {
                        setActiveSeries(group.series);
                        setStep("level");
                      }}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {group.series}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activeGroup ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>职称级别</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-600">{activeGroup.series}</span>
              </div>
              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                {activeGroup.levels.map((item) => {
                  const selected = current?.level.title === item.title;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => choose(item.title, close)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-xs text-slate-500">{item.level}</span>
                      <span className="block font-medium">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              先选择职称系列
            </div>
          )}
        </>
      )}
    </PickerShell>
  );
}
