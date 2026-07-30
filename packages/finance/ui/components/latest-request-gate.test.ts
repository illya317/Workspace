import assert from "node:assert/strict";
import test from "node:test";

import {
  createCurrentValueTracker,
  createLatestRequestGate,
  financeUiRequestScopeKey,
  financeUiResponseMatchesScope,
} from "./latest-request-gate";

test("a late manual reload cannot commit after a newer request starts even when abort is ignored", async () => {
  const gate = createLatestRequestGate();
  const oldResponse = deferred<string>();
  const newResponse = deferred<string>();
  const committed: string[] = [];

  const oldTicket = gate.begin("C01:2026:6");
  const oldLoad = oldResponse.promise.then((value) => {
    if (gate.isCurrent(oldTicket)) committed.push(value);
  });
  const newTicket = gate.begin("C01:2026:6");
  const newLoad = newResponse.promise.then((value) => {
    if (gate.isCurrent(newTicket)) committed.push(value);
  });

  newResponse.resolve("new");
  await newLoad;
  oldResponse.resolve("old");
  await oldLoad;
  assert.deepEqual(committed, ["new"]);
});

test("scope invalidation blocks a late response and scope equality is exact", async () => {
  const gate = createLatestRequestGate();
  const response = deferred<string>();
  const committed: string[] = [];
  const ticket = gate.begin("C01:2026:6");
  const load = response.promise.then((value) => {
    if (gate.isCurrent(ticket)) committed.push(value);
  });
  gate.invalidate();
  response.resolve("old-scope");
  await load;

  assert.deepEqual(committed, []);
  assert.equal(financeUiRequestScopeKey({ companyCode: "C01", year: 2026, month: 6 }), "C01:2026:6");
  assert.equal(financeUiResponseMatchesScope(
    { companyCode: "C01", year: 2026, month: 6 },
    { companyCode: "C01", year: 2026, month: 6 },
  ), true);
  assert.equal(financeUiResponseMatchesScope(
    { companyCode: "C02", year: 2026, month: 6 },
    { companyCode: "C01", year: 2026, month: 6 },
  ), false);

  const context = createCurrentValueTracker("run:1:4");
  assert.equal(context.isCurrent("run:1:4"), true);
  context.set("run:1:5");
  assert.equal(context.isCurrent("run:1:4"), false);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
