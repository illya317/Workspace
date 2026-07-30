import assert from "node:assert/strict";
import test from "node:test";

import { AgentTurnLimiter, MAX_CONCURRENT_AGENT_TURNS } from "./turn-limiter";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("agent turn concurrency is fixed at three", () => {
  assert.equal(MAX_CONCURRENT_AGENT_TURNS, 3);
});

test("fourth turn waits until one of three active turns releases", async () => {
  const limiter = new AgentTurnLimiter(3);
  const gates = [deferred(), deferred(), deferred()];
  const started: number[] = [];
  const active = gates.map((gate, index) => limiter.run(undefined, async () => {
    started.push(index);
    await gate.promise;
  }));
  const fourth = limiter.run(undefined, async () => {
    started.push(3);
  });

  await Promise.resolve();
  assert.deepEqual(started, [0, 1, 2]);
  assert.equal(limiter.activeCount, 3);
  assert.equal(limiter.waitingCount, 1);

  gates[1].resolve();
  await fourth;
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[0].resolve();
  gates[2].resolve();
  await Promise.all(active);
  assert.equal(limiter.activeCount, 0);
});

test("aborted queued turn is removed and does not consume a slot", async () => {
  const limiter = new AgentTurnLimiter(1);
  const gate = deferred();
  const active = limiter.run(undefined, () => gate.promise);
  const controller = new AbortController();
  const queued = limiter.run(controller.signal, async () => undefined);
  await Promise.resolve();
  assert.equal(limiter.waitingCount, 1);

  controller.abort();
  await assert.rejects(queued, { name: "AbortError" });
  assert.equal(limiter.waitingCount, 0);
  gate.resolve();
  await active;
  assert.equal(limiter.activeCount, 0);
});

test("failed turn always releases its slot", async () => {
  const limiter = new AgentTurnLimiter(1);
  await assert.rejects(limiter.run(undefined, async () => {
    throw new Error("boom");
  }), /boom/);
  assert.equal(limiter.activeCount, 0);
  await limiter.run(undefined, async () => undefined);
});

test("queue is bounded while three active slots remain unchanged", async () => {
  const limiter = new AgentTurnLimiter(1, 1);
  const gate = deferred();
  const active = limiter.run(undefined, () => gate.promise);
  const queued = limiter.run(undefined, async () => undefined);
  await Promise.resolve();
  await assert.rejects(limiter.run(undefined, async () => undefined), /队列已满/);
  assert.equal(limiter.activeCount, 1);
  gate.resolve();
  await Promise.all([active, queued]);
});
