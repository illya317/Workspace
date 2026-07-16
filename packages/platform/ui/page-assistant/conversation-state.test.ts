import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyConversationSnapshot } from "./conversation-state";

test("empty assistant conversations do not share mutable message or attachment arrays", () => {
  const first = createEmptyConversationSnapshot();
  const second = createEmptyConversationSnapshot();

  assert.notEqual(first.messages, second.messages);
  assert.notEqual(first.attachments, second.attachments);
  assert.deepEqual(first, {
    messages: [],
    draft: "",
    attachments: [],
    sessionId: null,
    sessionSummary: null,
    busyProposalId: null,
  });
});
