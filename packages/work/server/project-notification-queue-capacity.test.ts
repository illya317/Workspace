import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateProjectNotificationRulesInIsolation } from "./project-notification-evaluation-loop";
import { pendingProjectNotificationRuleRevisions } from "./project-notification-publication-runtime";

test("source-global rate limiting stops the rule loop at the first blocked rule", async () => {
  const rateLimited = new Error("rate limited");
  const visited: number[] = [];
  const batch = await evaluateProjectNotificationRulesInIsolation({
    items: [1, 2, 3, 4],
    evaluate: async (ruleId) => {
      visited.push(ruleId);
      if (ruleId === 2) throw rateLimited;
      return { ruleId, outcome: "published" };
    },
    isPermanentFailure: () => false,
    recordPermanentFailure: async () => null,
    toRetryableFailure: () => new Error("retry after rate window"),
    shouldStopAfterFailure: (error) => error === rateLimited,
  });
  assert.deepEqual(visited, [1, 2]);
  assert.deepEqual(batch.results, [{ ruleId: 1, outcome: "published" }]);
  assert.equal(batch.retryableFailure?.message, "retry after rate window");
});

test("a retry skips final evaluations but retains unfinished publication intents", async () => {
  const revisions = [{ ruleId: 1 }, { ruleId: 2 }, { ruleId: 3 }];
  const pending = pendingProjectNotificationRuleRevisions(revisions, new Set([1, 3]));
  const visited: number[] = [];
  await evaluateProjectNotificationRulesInIsolation({
    items: pending,
    evaluate: async ({ ruleId }) => {
      visited.push(ruleId);
      return { ruleId, outcome: "published" };
    },
    isPermanentFailure: () => false,
    recordPermanentFailure: async () => null,
    toRetryableFailure: () => new Error("retry"),
  });
  assert.deepEqual(visited, [2]);

  const evaluator = source("project-notification-evaluator.ts");
  assert.match(evaluator, /findFinalProjectNotificationEvaluationRuleIds/);
  assert.match(evaluator, /items: pendingRuleRevisions/);
  assert.ok(
    evaluator.indexOf("findProjectNotificationEvaluation")
      < evaluator.indexOf('existingIntent?.status === "committed"'),
  );
});

test("enqueue pins matching published revisions and mutation kicks only the oldest signal", () => {
  const signals = source("project-notification-signals.ts");
  assert.match(signals, /INNER JOIN "ProjectNotificationRuleRevision" AS revision/);
  assert.match(signals, /revision\."revision" = rule\."publishedRevision"/);
  assert.match(signals, /revision\."eventType" = \$\{parsed\.signalKind\}/);
  assert.doesNotMatch(signals, /rule\."eventType" = \$\{parsed\.signalKind\}/);
  assert.match(signals, /eligibleRuleRevisions\.length === 0[\s\S]*queued: false/);
  assert.match(signals, /revision\."eventType" = 'project\.scheduled'/);
  assert.match(
    signals,
    /bestEffortDrainProjectNotificationSignals[\s\S]*batchSize: 1, maxBatches: 1/,
  );
});

test("platform rate windows defer without consuming the signal terminal budget", () => {
  const platform = source("../../platform/server/notification-publication-rate-limit.ts");
  const evaluator = source("project-notification-evaluator.ts");
  const signals = source("project-notification-signals.ts");
  assert.match(platform, /NOTIFICATION_PUBLICATION_RATE_LIMITED/);
  assert.match(platform, /retryAt: new Date\(retryAtMs\)\.toISOString\(\)/);
  assert.match(platform, /retryAfter: Math\.max/);
  assert.match(evaluator, /publication_rate_limited/);
  assert.match(evaluator, /shouldStopAfterFailure/);
  assert.match(signals, /preserveAttempt: issue\.code === "publication_rate_limited"/);
  assert.match(signals, /Math\.max\(0, signal\.attemptCount - 1\)/);
  assert.match(signals, /"attemptCount" = \$\{storedAttemptCount\}/);
  assert.match(signals, /AND "attemptCount" = \$\{signal\.attemptCount\}/);
});

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}
