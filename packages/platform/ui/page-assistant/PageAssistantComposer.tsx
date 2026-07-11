import { ActionGlyph } from "@workspace/core/ui";
import type { ClipboardEvent, FormEvent, RefObject } from "react";

import type { PendingAttachment } from "./types";
import {
  attachmentSizeText,
} from "./types";

type Props = {
  attachments: PendingAttachment[];
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  sending: boolean;
  addImageAttachments: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  setDraft: (value: string) => void;
  stopRequest: () => void;
  submitMessage: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

/** @ui-specialized-surface Page Assistant composer owns message input, attachment paste, submit, and stop behavior. */
export function PageAssistantComposer({
  attachments,
  draft,
  inputRef,
  sending,
  addImageAttachments,
  removeAttachment,
  setDraft,
  stopRequest,
  submitMessage,
}: Props) {
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;
    if (!event.clipboardData.getData("text/plain")) {
      event.preventDefault();
    }
    addImageAttachments(imageFiles);
  }

  return (
    <form onSubmit={(event) => void submitMessage(event)} className="border-t border-slate-200 bg-white p-3">
      <label className="sr-only" htmlFor="page-assistant-input">输入问题</label>
      <PendingAttachments attachments={attachments} removeAttachment={removeAttachment} />
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          id="page-assistant-input"
          value={draft}
          rows={2}
          placeholder="输入问题"
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitMessage();
            }
          }}
          className="min-h-16 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        {sending ? (
          <button
            type="button"
            title="中止"
            aria-label="中止当前请求"
            onClick={stopRequest}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-white shadow-sm hover:bg-slate-700"
          >
            <ActionGlyph kind="stop" className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            title="发送"
            aria-label="发送"
            disabled={!draft.trim() && attachments.length === 0}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <ActionGlyph kind="send" className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}

function PendingAttachments({
  attachments,
  removeAttachment,
}: Pick<Props, "attachments" | "removeAttachment">) {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="group relative flex w-[92px] flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-50"
        >
          <div
            role="img"
            aria-label={attachment.name}
            className="h-16 w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${attachment.previewUrl})` }}
          />
          <div className="min-w-0 px-2 py-1">
            <div className="truncate text-[11px] leading-4 text-slate-700">{attachment.name}</div>
            <div className="text-[10px] leading-4 text-slate-400">{attachmentSizeText(attachment.size)}</div>
          </div>
          <button
            type="button"
            title="移除图片"
            aria-label={`移除图片 ${attachment.name}`}
            onClick={() => removeAttachment(attachment.id)}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-slate-900/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <ActionGlyph kind="x" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
