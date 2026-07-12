export const MAX_TOOL_CALL_ROUNDS_PER_MESSAGE = 10;

/** A fresh iterator is created for each user message, so the guard resets per request. */
export function* agentToolCallRounds() {
  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS_PER_MESSAGE; round += 1) {
    yield round;
  }
}
