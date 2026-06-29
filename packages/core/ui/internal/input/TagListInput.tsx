"use client";

import { Fragment, type ReactNode } from "react";
import RemovableTag from "./RemovableTag";
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

export default function TagListInput<T>({
  items,
  getKey,
  getLabel,
  onRemove,
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
