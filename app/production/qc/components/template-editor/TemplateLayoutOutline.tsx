"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "@/app/components/ConfirmModal";
import type {
  QcTemplateDetail,
  QcTemplateEditorTestDraft,
  QcTemplateInspectionCatalogItem,
  QcTemplateModuleLibraryItem,
  QcTemplateStage,
} from "@/server/services/production/qc";
import type { NewTestInput } from "./editor-utils";

interface Props {
  detail: QcTemplateDetail;
  testsByStage: Record<string, QcTemplateEditorTestDraft[]>;
  inspectionCatalog: QcTemplateInspectionCatalogItem[];
  moduleLibrary: QcTemplateModuleLibraryItem[];
  activeKey: string;
  onSelectPrecheck: (stage: QcTemplateStage) => void;
  onSelectTest: (stage: QcTemplateStage, test: QcTemplateEditorTestDraft) => void;
  onAddTest: (stage: QcTemplateStage, input: NewTestInput) => void;
  onReorderTest: (stage: QcTemplateStage, testId: string, targetIndex: number) => void;
  onDeleteTest: (stage: QcTemplateStage, testId: string) => void;
}

interface PendingDelete {
  stage: QcTemplateStage;
  test: QcTemplateEditorTestDraft;
}

function precheckClass(active: boolean) {
  return active
    ? "w-full min-h-[116px] rounded-[26px] border border-emerald-500 bg-emerald-50/50 px-5 py-4 text-left text-slate-900 shadow-sm"
    : "w-full min-h-[116px] rounded-[26px] border border-slate-200 bg-white px-5 py-4 text-left text-slate-900 hover:bg-slate-50";
}

function experimentHeaderClass() {
  return "flex min-h-[116px] items-center justify-between gap-3 rounded-[26px] border border-slate-200 bg-slate-50 px-5 py-4";
}

function matchCatalogItem(catalog: QcTemplateInspectionCatalogItem[], test: QcTemplateEditorTestDraft) {
  return (
    catalog.find((item) => item.matchKeys.includes(test.englishName)) ||
    catalog.find((item) => item.templates.some((template) => template.id === test.templateId || template.templateId === test.templateId))
  );
}

function availableCatalogItems(catalog: QcTemplateInspectionCatalogItem[], tests: QcTemplateEditorTestDraft[]) {
  const used = new Set(
    tests
      .map((test) => matchCatalogItem(catalog, test)?.key)
      .filter((value): value is string => Boolean(value)),
  );
  return catalog.filter((item) => !used.has(item.key));
}

function templateLabel(
  test: QcTemplateEditorTestDraft,
  catalogItem: QcTemplateInspectionCatalogItem | undefined,
  moduleLibrary: QcTemplateModuleLibraryItem[],
) {
  return (
    catalogItem?.templates.find((template) => template.id === test.templateId || template.templateId === test.templateId)?.displayName ||
    moduleLibrary.find((item) => item.id === test.templateId || item.templateId === test.templateId)?.displayName ||
    test.templateId ||
    "未映射模块"
  );
}

export default function TemplateLayoutOutline({
  detail,
  testsByStage,
  inspectionCatalog,
  moduleLibrary,
  activeKey,
  onSelectPrecheck,
  onSelectTest,
  onAddTest,
  onReorderTest,
  onDeleteTest,
}: Props) {
  const [addingStageKey, setAddingStageKey] = useState("");
  const [addingItemKey, setAddingItemKey] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editingStageKey, setEditingStageKey] = useState("");
  const [dragging, setDragging] = useState<{ stageKey: string; testId: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState("");
  const catalogByKey = useMemo(() => new Map(inspectionCatalog.map((item) => [item.key, item])), [inspectionCatalog]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextCardClickRef = useRef(false);
  const editingActivatedAtRef = useRef(0);

  function startAdd(stage: QcTemplateStage) {
    const options = availableCatalogItems(inspectionCatalog, testsByStage[stage.key] || []);
    setEditingStageKey("");
    setAddingStageKey(stage.key);
    setAddingItemKey(options[0]?.key || "");
  }

  function cancelAdd() {
    setAddingStageKey("");
    setAddingItemKey("");
  }

  function submitAdd(stage: QcTemplateStage) {
    const item = catalogByKey.get(addingItemKey);
    if (!item) return;
    onAddTest(stage, {
      name: item.label,
      englishName: item.englishName,
      methodName: item.methodName,
      templateId: item.templates[0]?.id,
    });
    cancelAdd();
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function beginLongPress(stageKey: string) {
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      editingActivatedAtRef.current = Date.now();
      suppressNextCardClickRef.current = true;
      setEditingStageKey((current) => (current === stageKey ? "" : stageKey));
      longPressTimerRef.current = null;
    }, 450);
  }

  function exitEditing() {
    clearLongPressTimer();
    setEditingStageKey("");
  }

  useEffect(() => {
    if (!editingStageKey) return;

    function handlePointerDown(event: PointerEvent) {
      if (Date.now() - editingActivatedAtRef.current < 220) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-delete-button='true']")) return;
      exitEditing();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [editingStageKey]);

  return (
    <aside className="p-4 pr-5" style={{ scrollbarGutter: "stable both-edges" }}>
      <div className="mb-4 px-1">
        <h2 className="text-sm font-semibold text-slate-900">版面结构</h2>
        <p className="mt-1 text-xs text-slate-500">最低颗粒度到检测项目。</p>
      </div>

      <div className="space-y-5">
        {detail.stages.map((stage) => {
          const tests = testsByStage[stage.key] || [];
          const addOptions = availableCatalogItems(inspectionCatalog, tests);
          const stageEditing = editingStageKey === stage.key;

          return (
            <section key={stage.key} className="space-y-3">
              <div className="px-1 text-xs font-semibold text-slate-500">{stage.label}</div>

              <button onClick={() => onSelectPrecheck(stage)} className={precheckClass(activeKey === `${stage.key}:precheck`)}>
                <span className="block text-xl font-semibold">1 检验前确认</span>
                <span className="mt-2 block text-sm text-slate-500">{stage.documentCount} 份文件 · {stage.precheckItemCount} 个确认项</span>
              </button>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  clearLongPressTimer();
                  if (!stageEditing) {
                    setEditingStageKey(stage.key);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  clearLongPressTimer();
                  if (!stageEditing) {
                    setEditingStageKey(stage.key);
                  }
                }}
                className={`${experimentHeaderClass()} ${stageEditing ? "cursor-default" : "cursor-pointer"}`}
              >
                <div>
                  <div className="text-xl font-semibold text-slate-900">2 实验项目</div>
                  <div className="mt-1 text-sm text-slate-500">{tests.length} 个检测项</div>
                </div>
                {stageEditing ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startAdd(stage);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-lg font-semibold text-emerald-700 hover:bg-emerald-100"
                    title="新增实验项目"
                  >
                    +
                  </button>
                ) : null}
              </div>

              {addingStageKey === stage.key && (
                <div className="ml-5 mr-4 rounded-[24px] border border-emerald-200 bg-emerald-50/60 p-3">
                  {addOptions.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid gap-3">
                        <label className="space-y-1">
                          <span className="block text-xs font-semibold text-slate-500">项目</span>
                          <select
                            value={addingItemKey}
                            onChange={(event) => setAddingItemKey(event.target.value)}
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                          >
                            {addOptions.map((item) => (
                              <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={cancelAdd} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
                          取消
                        </button>
                        <button onClick={() => submitAdd(stage)} className="h-9 rounded-md border border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                          添加
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-600">这个阶段的标准检测项已经都加进来了。</div>
                      <button onClick={cancelAdd} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
                        关闭
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {tests.map((test, index) => {
                  const key = `${stage.key}:test:${test.id}`;
                  const active = activeKey === key;
                  const item = matchCatalogItem(inspectionCatalog, test);
                  const draggingSelf = dragging?.stageKey === stage.key && dragging.testId === test.id;
                  const dragOverSelf = dragOverKey === key;

                  return (
                    <div
                      key={key}
                      draggable={!stageEditing}
                      onDragStart={(event) => {
                        if (stageEditing) {
                          event.preventDefault();
                          return;
                        }
                        clearLongPressTimer();
                        setDragging({ stageKey: stage.key, testId: test.id });
                        setDragOverKey(key);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", test.id);
                      }}
                      onDragOver={(event) => {
                        if (!dragging || dragging.stageKey !== stage.key || dragging.testId === test.id) return;
                        event.preventDefault();
                        if (dragOverKey !== key) setDragOverKey(key);
                      }}
                      onDrop={(event) => {
                        if (!dragging || dragging.stageKey !== stage.key) return;
                        event.preventDefault();
                        onReorderTest(stage, dragging.testId, index);
                        setDragging(null);
                        setDragOverKey("");
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDragOverKey("");
                      }}
                      className={`relative ml-5 mr-4 rounded-[22px] border bg-white transition ${
                        active
                          ? "border-emerald-500 bg-emerald-50/55 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                      } ${draggingSelf ? "opacity-70" : ""} ${dragOverSelf && !draggingSelf ? "ring-2 ring-emerald-200" : ""} ${stageEditing ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                      onPointerDown={() => beginLongPress(stage.key)}
                      onPointerUp={clearLongPressTimer}
                      onPointerLeave={clearLongPressTimer}
                      onPointerCancel={clearLongPressTimer}
                    >
                      {stageEditing && (
                        <button
                          type="button"
                          data-delete-button="true"
                          title="删除"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearLongPressTimer();
                            setPendingDelete({ stage, test });
                          }}
                          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-lg font-semibold text-red-500 shadow-sm hover:bg-red-50"
                        >
                          -
                        </button>
                      )}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          clearLongPressTimer();
                          if (suppressNextCardClickRef.current) {
                            suppressNextCardClickRef.current = false;
                            return;
                          }
                          if (stageEditing) {
                            setEditingStageKey("");
                            return;
                          }
                          onSelectTest(stage, test);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          clearLongPressTimer();
                          if (suppressNextCardClickRef.current) {
                            suppressNextCardClickRef.current = false;
                            return;
                          }
                          if (stageEditing) {
                            setEditingStageKey("");
                            return;
                          }
                          onSelectTest(stage, test);
                        }}
                        className="block w-full select-none px-5 py-4 text-left outline-none"
                      >
                        <div className="min-w-0 pr-8">
                          <div className={`truncate text-[18px] font-semibold leading-tight ${active ? "text-emerald-800" : "text-slate-900"}`}>
                            {test.sequence || `2.${test.order}`} {test.name}
                          </div>
                          <div className="mt-1.5 truncate text-[13px] text-slate-500">
                            {test.methodName || "未配置"} · {templateLabel(test, item, moduleLibrary)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="确认删除检测项"
        message={pendingDelete ? `确定删除“${pendingDelete.test.sequence || ""} ${pendingDelete.test.name}”吗？删除后顺序会自动重排。` : ""}
        confirmLabel="删除"
        onConfirm={() => {
          if (!pendingDelete) return;
          onDeleteTest(pendingDelete.stage, pendingDelete.test.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
}
