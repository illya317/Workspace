"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { feedbackContext, feedbackKey, selectionTitle, type WorkbenchSelection } from "./types";

type AnchorKind = "heading" | "field";

interface InlineAnchor {
  kind: AnchorKind;
  key: string;
  label: string;
  section?: string;
  badgeKind?: string;
  rect: DOMRect;
}

interface InlineEntry {
  id: string;
  target: {
    kind: AnchorKind;
    key: string;
    label: string;
    section?: string;
    badgeKind?: string;
  };
  note: string;
}

interface FeedbackResponse {
  data?: { inlineEntries?: InlineEntry[] } | null;
  keys?: string[];
  error?: string;
}

interface Props {
  selection: WorkbenchSelection;
  children: ReactNode;
  onSaved?: (keys: string[]) => void;
}

const MARKER_SIZE = 24;
const MARKER_GAP = 6;
const MARKER_HIT_PADDING = 8;
const EDITOR_WIDTH = 320;
const EDITOR_HEIGHT = 260;
const HIDE_DELAY_MS = 500;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

function anchorId(anchor: Omit<InlineAnchor, "rect">) {
  return [
    anchor.kind,
    normalizePart(anchor.key),
    normalizePart(anchor.section || ""),
    normalizePart(anchor.label),
  ].filter(Boolean).join("/");
}

function readAnchor(node: HTMLElement | null): InlineAnchor | null {
  if (!node) return null;
  const kind = node.dataset.inlineFeedbackKind;
  const key = node.dataset.inlineFeedbackKey;
  const label = node.dataset.inlineFeedbackLabel;
  if (!kind || !key || !label) return null;
  if (kind !== "heading" && kind !== "field") return null;
  return {
    kind,
    key,
    label,
    section: node.dataset.inlineFeedbackSection || undefined,
    badgeKind: node.dataset.inlineFeedbackBadgeKind || undefined,
    rect: node.getBoundingClientRect(),
  };
}

function findAnchorElement(anchorLike: Omit<InlineAnchor, "rect">): InlineAnchor | null {
  const nodes = document.querySelectorAll<HTMLElement>("[data-inline-feedback='true']");
  for (const node of nodes) {
    const anchor = readAnchor(node);
    if (anchor && anchorId(anchor) === anchorId(anchorLike)) return anchor;
  }
  return null;
}

function markerStyle(rect: DOMRect) {
  return {
    top: clamp(rect.top - MARKER_SIZE / 2 - MARKER_HIT_PADDING, 0, window.innerHeight - MARKER_SIZE - MARKER_HIT_PADDING * 2),
    left: clamp(rect.right + MARKER_GAP - MARKER_HIT_PADDING - 4, 0, window.innerWidth - MARKER_SIZE - MARKER_HIT_PADDING * 2),
  };
}

function editorStyle(rect: DOMRect) {
  const enoughBelow = rect.bottom + MARKER_GAP + EDITOR_HEIGHT <= window.innerHeight - 16;
  const top = enoughBelow ? rect.bottom + MARKER_GAP : rect.top - EDITOR_HEIGHT - MARKER_GAP;
  return {
    top: clamp(top, 16, window.innerHeight - EDITOR_HEIGHT - 16),
    left: clamp(rect.right - EDITOR_WIDTH, 16, window.innerWidth - EDITOR_WIDTH - 16),
  };
}

function FeedbackMarkerButton({
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

export default function TemplateInlineFeedback({ selection, children, onSaved }: Props) {
  const context = useMemo(() => feedbackContext(selection), [selection]);
  const contextKey = useMemo(() => feedbackKey(context), [context]);
  const hoverTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pendingAnchorIdRef = useRef("");
  const [anchor, setAnchor] = useState<InlineAnchor | null>(null);
  const [savedEntries, setSavedEntries] = useState<InlineEntry[]>([]);
  const [savedMarkers, setSavedMarkers] = useState<InlineAnchor[]>([]);
  const [popoverHovered, setPopoverHovered] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function clearHoverTimer() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    pendingAnchorIdRef.current = "";
  }

  function clearHideTimer() {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function queueHide() {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      if (!popoverHovered && !editorOpen) setAnchor(null);
    }, HIDE_DELAY_MS);
  }

  async function refreshInlineEntries() {
    try {
      const response = await fetch(`/workspace/api/production/qc/template-feedback?key=${encodeURIComponent(contextKey)}`);
      const body = await response.json() as FeedbackResponse;
      setSavedEntries(body.data?.inlineEntries || []);
      return body.data?.inlineEntries || [];
    } catch {
      setSavedEntries([]);
      return [];
    }
  }

  function syncSavedMarkers(entries: InlineEntry[]) {
    const nextMarkers = entries
      .map((entry) => findAnchorElement(entry.target))
      .filter((value): value is InlineAnchor => Boolean(value));
    setSavedMarkers(nextMarkers);
  }

  function isSavedAnchor(candidate: Omit<InlineAnchor, "rect"> | null) {
    if (!candidate) return false;
    const id = anchorId(candidate);
    return savedEntries.some((entry) => entry.id === id);
  }

  useEffect(() => {
    setAnchor(null);
    setEditorOpen(false);
    setNote("");
    setError("");
    setSavedEntries([]);
    setSavedMarkers([]);
    clearHoverTimer();
    clearHideTimer();
  }, [contextKey]);

  useEffect(() => () => {
    clearHoverTimer();
    clearHideTimer();
  }, []);

  useEffect(() => {
    void refreshInlineEntries();
  }, [contextKey]);

  useEffect(() => {
    syncSavedMarkers(savedEntries);
    const refresh = () => syncSavedMarkers(savedEntries);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [savedEntries]);

  useEffect(() => {
    if (!anchor) return;
    const refresh = () => {
      const active = findAnchorElement(anchor);
      if (!active) return;
      setAnchor((current) => current ? { ...current, rect: active.rect } : current);
    };
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [anchor]);

  async function openEditor(nextAnchor: InlineAnchor) {
    setEditorOpen(true);
    setError("");
    setLoading(true);
    try {
      const entries = await refreshInlineEntries();
      const matched = entries.find((entry) => entry.id === anchorId(nextAnchor));
      setNote(matched?.note || "");
    } catch {
      setError("读取反馈失败");
      setNote("");
    } finally {
      setLoading(false);
    }
  }

  async function saveInlineFeedback() {
    if (!anchor) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/workspace/api/production/qc/template-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          inlineEntry: {
            target: {
              kind: anchor.kind,
              key: anchor.key,
              label: anchor.label,
              section: anchor.section,
              badgeKind: anchor.badgeKind,
            },
            note,
          },
        }),
      });
      const body = await response.json() as FeedbackResponse;
      if (!response.ok) throw new Error(body.error || "保存失败");
      const nextEntries = body.data?.inlineEntries || [];
      setSavedEntries(nextEntries);
      syncSavedMarkers(nextEntries);
      onSaved?.(body.keys || []);
      setEditorOpen(false);
      setAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (editorOpen) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-inline-feedback='true']") ?? null;
    const nextAnchor = readAnchor(target);
    if (!nextAnchor) {
      clearHoverTimer();
      if (!popoverHovered) queueHide();
      return;
    }
    clearHideTimer();
    const sameAnchor = anchor && anchorId(anchor) === anchorId(nextAnchor);
    if (sameAnchor) {
      setAnchor({ ...nextAnchor });
      return;
    }
    const nextAnchorId = anchorId(nextAnchor);
    if (pendingAnchorIdRef.current === nextAnchorId) return;
    clearHoverTimer();
    pendingAnchorIdRef.current = nextAnchorId;
    hoverTimerRef.current = window.setTimeout(() => {
      setAnchor(nextAnchor);
      pendingAnchorIdRef.current = "";
      hoverTimerRef.current = null;
    }, 500);
  }

  const popoverStyle = anchor ? markerStyle(anchor.rect) : undefined;

  const inlineEditorStyle = anchor ? editorStyle(anchor.rect) : undefined;

  return (
    <div
      className="relative"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        clearHoverTimer();
        if (!popoverHovered && !editorOpen) queueHide();
      }}
    >
      {children}
      {savedMarkers.map((marker) => (
        <div
          key={`saved-${anchorId(marker)}`}
          className="fixed z-30 p-2"
          style={markerStyle(marker.rect)}
        >
          <FeedbackMarkerButton tone="saved" onClick={() => openEditor(marker)} />
        </div>
      ))}
      {anchor && !editorOpen && !isSavedAnchor(anchor) ? (
        <div
          className="fixed z-40 p-2"
          style={popoverStyle}
          onMouseEnter={() => {
            clearHideTimer();
            setPopoverHovered(true);
          }}
          onMouseLeave={() => {
            setPopoverHovered(false);
            queueHide();
          }}
        >
          <FeedbackMarkerButton tone="hover" onClick={() => openEditor(anchor)} />
        </div>
      ) : null}
      {anchor && editorOpen ? (
        <div
          className="fixed z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
          style={inlineEditorStyle}
          onMouseEnter={() => setPopoverHovered(true)}
          onMouseLeave={() => setPopoverHovered(false)}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">字段反馈</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {anchor.section ? `${anchor.section} · ` : ""}{anchor.label}
              </div>
            </div>
            <button
              type="button"
              className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200"
              onClick={() => {
                setEditorOpen(false);
                queueHide();
              }}
              aria-label="关闭字段反馈"
            >
              ×
            </button>
          </div>
          <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[12px] text-slate-600">
            {selectionTitle(selection)}
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={5}
            placeholder="描述这个标题或字段的问题。"
            className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            disabled={loading || saving}
          />
          {error ? <div className="mt-2 text-xs font-medium text-red-600">{error}</div> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setEditorOpen(false);
                queueHide();
              }}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              onClick={saveInlineFeedback}
              disabled={saving || loading}
            >
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
