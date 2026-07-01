"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { ActionGlyph, type ActionGlyphKind } from "@workspace/core/ui";
import {
  getPermissionActionGlyph,
  getPermissionActionLabel,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import {
  PERMISSION_MATRIX_ACTION_COLUMNS as ACTION_COLUMNS,
  PERMISSION_MATRIX_MAX_DETAIL_ROWS as MAX_DETAIL_ROWS,
  permissionSourceLabel,
  permissionSourceTone,
  summarizePermissionActionColumn,
  type PermissionActionRecordLike,
  type PermissionMatrixSource,
} from "./permission-matrix-model";

export interface PermissionMatrixActionState {
  actionKey: PermissionActionKey;
  has: boolean;
  source: PermissionMatrixSource;
  sourceActionKey: PermissionActionKey | null;
  sourceResourceKey: string | null;
  directGrantable: boolean;
  pendingResourceMapping: boolean;
}

export interface PermissionMatrixRecord<TState extends PermissionMatrixActionState = PermissionMatrixActionState>
  extends PermissionActionRecordLike<TState> {
  actionStates: Record<PermissionActionKey, TState>;
}

export interface PermissionActionMatrixGridProps<TSubject, TState extends PermissionMatrixActionState> {
  subjects: TSubject[];
  subjectColumnLabel: string;
  getSubjectKey: (subject: TSubject) => string;
  renderSubject: (subject: TSubject) => ReactNode;
  getRecord: (subject: TSubject) => PermissionMatrixRecord<TState> | null | undefined;
  expandedKeys: ReadonlySet<string>;
  onToggleExpand: (subject: TSubject) => void;
  onToggleAction?: (subject: TSubject, state: TState) => void;
  canToggleAction?: (subject: TSubject, state: TState) => boolean;
  savingKey?: string | null;
}

const SUBJECT_COLUMN_WIDTH = "6.25rem";
const MATRIX_GRID_TEMPLATE = `${SUBJECT_COLUMN_WIDTH} repeat(${ACTION_COLUMNS.length}, minmax(0, 1fr))`;

const CHIP_TONE_CLASS = {
  green: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
  red: "bg-red-50 text-red-700 hover:bg-red-100",
  blue: "bg-sky-50 text-sky-600 hover:bg-sky-100",
  yellow: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
  gray: "bg-gray-100 text-gray-500 hover:bg-gray-200",
};

function onKeyboardActivate(callback: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    callback();
  };
}

function stateSourceText(state: PermissionMatrixActionState) {
  if (!state.has || !state.source) return "未授权";
  const implied = state.sourceActionKey ? ` / 由${state.sourceActionKey}隐含` : "";
  const resource = state.sourceResourceKey ? ` / ${state.sourceResourceKey}` : "";
  return `${permissionSourceLabel(state.source)}${implied}${resource}`;
}

function chipTitle(state: PermissionMatrixActionState, disabled: boolean) {
  const unsupported = state.pendingResourceMapping ? " / 该资源未接入" : "";
  const locked = disabled ? " / 不可直接授予" : "";
  return `${getPermissionActionLabel(state.actionKey)} (${state.actionKey}) · ${stateSourceText(state)}${unsupported}${locked}`;
}

function permissionChip<TSubject, TState extends PermissionMatrixActionState>({
  subject,
  state,
  disabled,
  onToggle,
  tabIndex,
}: {
  subject: TSubject;
  state: TState;
  disabled?: boolean;
  onToggle?: (subject: TSubject, state: TState) => void;
  tabIndex?: number;
}) {
  const resolvedDisabled = Boolean(disabled || state.pendingResourceMapping || !state.directGrantable);
  const interactive = Boolean(onToggle);
  const tone = state.has ? permissionSourceTone(state.source) : "gray";
  const title = chipTitle(state, resolvedDisabled);
  const className = `inline-flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition ${CHIP_TONE_CLASS[tone]} ${interactive && !resolvedDisabled ? "cursor-pointer" : "cursor-default"} ${resolvedDisabled ? "opacity-70" : ""}`;
  const content = (
    <>
      <ActionGlyph kind={getPermissionActionGlyph(state.actionKey) as ActionGlyphKind} className="h-3 w-3" />
      <span>{getPermissionActionLabel(state.actionKey)}</span>
    </>
  );

  if (!interactive) {
    return (
      <span className={className} title={title} aria-label={title}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-disabled={resolvedDisabled}
      aria-label={title}
      aria-pressed={state.has}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation();
        if (resolvedDisabled) return;
        onToggle?.(subject, state);
      }}
    >
      {content}
    </button>
  );
}

function summaryCellContent<TSubject, TState extends PermissionMatrixActionState>(
  states: TState[],
  subject: TSubject,
  onClick: () => void,
) {
  const keyboardHandler = onKeyboardActivate(onClick);
  if (states.length === 0) {
    return (
      <div role="button" tabIndex={0} className="block w-full text-center text-slate-400" onClick={onClick} onKeyDown={keyboardHandler}>
        -
      </div>
    );
  }
  return (
    <div role="button" tabIndex={0} className="flex w-full flex-wrap items-center justify-center gap-1.5" onClick={onClick} onKeyDown={keyboardHandler}>
      {states.map((state) => <span key={state.actionKey}>{permissionChip({ state, subject })}</span>)}
    </div>
  );
}

function MatrixHeader({ subjectColumnLabel }: { subjectColumnLabel: string }) {
  return (
    <div
      className="grid min-w-0 border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-500"
      style={{ gridTemplateColumns: MATRIX_GRID_TEMPLATE }}
    >
      <div className="px-4 py-3 text-left">{subjectColumnLabel}</div>
      {ACTION_COLUMNS.map((column) => (
        <div key={column.key} className="px-3 py-3 text-center">{column.columnLabel}</div>
      ))}
    </div>
  );
}

export function PermissionActionMatrixGrid<TSubject, TState extends PermissionMatrixActionState>({
  subjects,
  subjectColumnLabel,
  getSubjectKey,
  renderSubject,
  getRecord,
  expandedKeys,
  onToggleExpand,
  onToggleAction,
  canToggleAction,
  savingKey,
}: PermissionActionMatrixGridProps<TSubject, TState>) {
  return (
    <div className="min-w-0 overflow-hidden bg-white">
      <MatrixHeader subjectColumnLabel={subjectColumnLabel} />
      <div className="divide-y divide-slate-100">
        {subjects.map((subject) => {
          const subjectKey = getSubjectKey(subject);
          const expanded = expandedKeys.has(subjectKey);
          const record = getRecord(subject);
          const toggle = () => onToggleExpand(subject);
          const keyboardHandler = onKeyboardActivate(toggle);
          return (
            <div key={subjectKey} className="min-w-0">
              <div
                className={`grid min-w-0 items-center transition-colors duration-150 ${expanded ? "bg-emerald-50" : "bg-white hover:bg-slate-50/70"}`}
                style={{ gridTemplateColumns: MATRIX_GRID_TEMPLATE, minHeight: "4rem" }}
              >
                <div role="button" tabIndex={0} className="px-4 py-3 text-left" onClick={toggle} onKeyDown={keyboardHandler}>
                  {renderSubject(subject)}
                </div>
                {ACTION_COLUMNS.map((column) => (
                  <div key={column.key} className="px-3 py-3 text-center">
                    {summaryCellContent(summarizePermissionActionColumn(record, column.actions, column.mode), subject, toggle)}
                  </div>
                ))}
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                aria-hidden={!expanded}
              >
                <div className={`min-h-0 overflow-hidden bg-slate-50/60 ${expanded ? "" : "pointer-events-none"}`}>
                  {record
                    ? Array.from({ length: MAX_DETAIL_ROWS }, (_, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="grid min-w-0 items-center border-t border-slate-100"
                          style={{ gridTemplateColumns: MATRIX_GRID_TEMPLATE, minHeight: "3.25rem" }}
                        >
                          <div className="px-4 py-2" />
                          {ACTION_COLUMNS.map((column) => {
                            const actionKey = column.actions[rowIndex];
                            if (!actionKey) return <div key={column.key} className="px-3 py-2" />;
                            const state = record.actionStates[actionKey];
                            return (
                              <div key={column.key} className="px-3 py-2 text-center">
                                {permissionChip({
                                  state,
                                  subject,
                                  disabled: savingKey === `${subjectKey}:${actionKey}` || !(canToggleAction?.(subject, state) ?? true),
                                  onToggle: onToggleAction,
                                  tabIndex: expanded ? undefined : -1,
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ))
                    : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
