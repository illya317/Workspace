export async function evaluateProjectNotificationRulesInIsolation<Item, Result>(input: {
  items: readonly Item[];
  evaluate: (item: Item) => Promise<Result | null>;
  isPermanentFailure: (error: unknown) => boolean;
  recordPermanentFailure: (item: Item, error: unknown) => Promise<Result | null>;
  toRetryableFailure: (error: unknown) => Error;
  beforeEach?: (item: Item) => Promise<void>;
  shouldStopAfterFailure?: (error: unknown) => boolean;
}) {
  const results: Result[] = [];
  let retryableFailure: Error | null = null;
  for (const item of input.items) {
    try {
      await input.beforeEach?.(item);
      const result = await input.evaluate(item);
      if (result !== null) results.push(result);
    } catch (error) {
      if (input.isPermanentFailure(error)) {
        try {
          const recorded = await input.recordPermanentFailure(item, error);
          if (recorded !== null) results.push(recorded);
        } catch (recordError) {
          retryableFailure ??= input.toRetryableFailure(recordError);
        }
      } else {
        retryableFailure ??= input.toRetryableFailure(error);
      }
      if (input.shouldStopAfterFailure?.(error)) break;
    }
  }
  return { results, retryableFailure };
}
