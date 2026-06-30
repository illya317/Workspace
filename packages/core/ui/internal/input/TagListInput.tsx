"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import RemovableTag from "./RemovableTag";
import TagRemoveButton from "./TagRemoveButton";
import TagInputShell from "./TagInputShell";
import TagPill from "./TagPill";
import { joinClassNames } from "../common/card-utils";
import type { ConfirmOptions } from "../../services/FeedbackProvider";

export interface TagListInputItemContext<T> {
  item: T;
  index: number;
  label: string;
  disabled: boolean;
}

export interface TagListInputProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  getLabel: (item: T, index: number) => string;
  onRemove?: (item: T, index: number) => void | Promise<void>;
  onUpdateLabel?: (item: T, index: number, label: string) => void | Promise<void>;
  onItemClick?: (item: T, index: number) => void | Promise<void>;
  disabled?: boolean;
  emptyText?: ReactNode;
  /** @deprecated 请使用 removeConfirmMessage */
  confirmMessage?: (item: T, index: number) => ConfirmOptions["message"];
  confirmDelete?: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  /** @deprecated 请使用 confirmRemove */
  confirm?: boolean;
  confirmOptions?: Partial<ConfirmOptions>;
  confirmRemove?: boolean;
  removeConfirmMessage?: (item: T, index: number) => string;
  removeConfirmTitle?: string;
  renderItem?: (context: TagListInputItemContext<T>) => ReactNode;
  itemClassName?: (item: T, index: number) => string | undefined;
  itemTitle?: (item: T, index: number) => string | undefined;
  itemActionLabel?: (item: T, index: number) => string | undefined;
  maxLength?: number;
  children?: ReactNode;
  append?: ReactNode;
  className?: string;
  shellClassName?: string;
}

function EditableTag<T>({
  className,
  confirmDelete,
  confirmMessage,
  confirmOptions,
  confirmRemove,
  disabled,
  index,
  item,
  label,
  maxLength,
  onRemove,
  onUpdateLabel,
  removeConfirmTitle,
  removeLabel,
  title,
}: {
  className?: string;
  confirmDelete?: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  confirmMessage?: ConfirmOptions["message"];
  confirmOptions?: Partial<ConfirmOptions>;
  confirmRemove: boolean;
  disabled: boolean;
  index: number;
  item: T;
  label: string;
  maxLength?: number;
  onRemove?: (item: T, index: number) => void | Promise<void>;
  onUpdateLabel: (item: T, index: number, label: string) => void | Promise<void>;
  removeConfirmTitle?: string;
  removeLabel: string;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [editing, label]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === label) {
      setDraft(label);
      return;
    }
    await onUpdateLabel(item, index, next);
  }

  function cancel() {
    setDraft(label);
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      void commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <span className="inline-flex" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <TagPill
        title={title}
        disabled={disabled}
        maxLength={maxLength}
        className={joinClassNames("px-3 text-slate-700", className)}
        textClassName="truncate"
        action={
          !disabled && onRemove ? (
            <TagRemoveButton
              label={removeLabel}
              confirm={confirmRemove}
              confirmDelete={confirmDelete}
              confirmMessage={confirmMessage}
              confirmOptions={{ title: removeConfirmTitle, ...confirmOptions }}
              onConfirm={() => onRemove(item, index)}
              className="pointer-events-auto ml-0.5 shrink-0 border border-sky-200 bg-sky-50 text-sky-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            />
          ) : null
        }
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            aria-label={`编辑 ${label}`}
            className="block min-w-16 max-w-full bg-transparent font-inherit text-inherit outline-none"
            style={{ width: `${Math.max(4, Math.min(32, draft.length || label.length))}em` }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <button
            type="button"
            title={title ?? label}
            disabled={disabled}
            className="block max-w-full truncate text-left disabled:cursor-not-allowed"
            onClick={() => setEditing(true)}
          >
            {label}
          </button>
        )}
      </TagPill>
    </span>
  );
}

export default function TagListInput<T>({
  items,
  getKey,
  getLabel,
  onRemove,
  onUpdateLabel,
  onItemClick,
  disabled = false,
  emptyText,
  confirmMessage,
  confirmDelete,
  confirm = true,
  confirmOptions,
  confirmRemove,
  removeConfirmMessage,
  removeConfirmTitle,
  renderItem,
  itemClassName,
  itemTitle,
  itemActionLabel,
  maxLength,
  children,
  append,
  className = "",
  shellClassName = "",
}: TagListInputProps<T>) {
  return (
    <div className={className}>
      <TagInputShell
        disabled={disabled}
        className={shellClassName}
      >
        {items.length === 0 && emptyText !== undefined ? (
          <span className="text-sm text-slate-400">{emptyText}</span>
        ) : (
          items.map((item, index) => {
            const key = getKey(item, index);
            const label = getLabel(item, index);
            if (label.trim() === "") return null;
            const title = itemTitle?.(item, index);
            const extraClassName = itemClassName?.(item, index);
            const removeLabel = `删除 ${label}`;
            const message = removeConfirmMessage?.(item, index) ?? confirmMessage?.(item, index);
            const removeConfirm = confirmRemove ?? confirm;

            if (renderItem) {
              return (
                <Fragment key={key}>
                  {renderItem({ item, index, label, disabled })}
                </Fragment>
              );
            }

            if (onItemClick) {
              return (
                <button
                  key={key}
                  type="button"
                  title={title ?? label}
                  aria-label={itemActionLabel?.(item, index) ?? title ?? label}
                  disabled={disabled}
                  onClick={() => void onItemClick(item, index)}
                  className="rounded-full transition hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  <TagPill
                    title={title}
                    disabled={disabled}
                    maxLength={maxLength}
                    className={joinClassNames(
                      "text-slate-800 transition hover:border-sky-300 hover:bg-sky-50",
                      extraClassName,
                    )}
                  >
                    {label}
                  </TagPill>
                </button>
              );
            }

            if (onUpdateLabel) {
              return (
                <EditableTag
                  key={key}
                  item={item}
                  index={index}
                  label={label}
                  removeLabel={removeLabel}
                  title={title}
                  disabled={disabled}
                  confirmRemove={removeConfirm}
                  confirmDelete={confirmDelete}
                  confirmMessage={message}
                  confirmOptions={confirmOptions}
                  removeConfirmTitle={removeConfirmTitle}
                  maxLength={maxLength}
                  className={extraClassName}
                  onRemove={onRemove}
                  onUpdateLabel={onUpdateLabel}
                />
              );
            }

            if (onRemove) {
              return (
                <RemovableTag
                  key={key}
                  label={removeLabel}
                  title={title}
                  disabled={disabled}
                  confirm={removeConfirm}
                  confirmDelete={confirmDelete}
                  confirmMessage={message}
                  confirmOptions={{ title: removeConfirmTitle, ...confirmOptions }}
                  maxLength={maxLength}
                  className={extraClassName}
                  onRemove={() => onRemove(item, index)}
                >
                  {label}
                </RemovableTag>
              );
            }

            return (
              <TagPill
                key={key}
                title={title}
                disabled={disabled}
                maxLength={maxLength}
                className={extraClassName}
              >
                {label}
              </TagPill>
            );
          })
        )}
        {append}
        {children}
      </TagInputShell>
    </div>
  );
}
