"use client";

import { Fragment, type ReactNode } from "react";
import RemovableTag from "./RemovableTag";
import TagPill from "./TagPill";
import { getTagInputShellClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";
import type { ConfirmOptions } from "./ConfirmProvider";

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
  confirmMessage?: (item: T, index: number) => ConfirmOptions["message"];
  confirm?: boolean;
  confirmOptions?: Partial<ConfirmOptions>;
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
  confirm = true,
  confirmOptions,
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
      <div
        className={joinClassNames(
          getTagInputShellClassName(),
          disabled && "bg-slate-100",
          shellClassName,
        )}
      >
        {items.length === 0 && emptyText !== undefined ? (
          <span className="text-sm text-slate-400">{emptyText}</span>
        ) : (
          items.map((item, index) => {
            const key = getKey(item, index);
            const label = getLabel(item, index);
            const title = itemTitle?.(item, index);
            const extraClassName = itemClassName?.(item, index);
            const removeLabel = `删除 ${label}`;
            const message = confirmMessage?.(item, index);

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
                  confirm={confirm}
                  confirmMessage={message}
                  confirmOptions={confirmOptions}
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
      </div>
    </div>
  );
}
