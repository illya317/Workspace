import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  WECOM_NOTIFICATION_DELIVERY_CONTRACT,
  buildWecomWorkerCanonicalRequest,
  buildWecomWorkerSignature,
  createWecomNotificationDeliveryWorker,
  formatWecomNotificationMarkdown,
  resolveWecomNotificationRedirectOrigin,
  workspaceNotificationHref,
} from "./wecom-notification-delivery.mjs";

const SECRET = "notification-worker-secret-32-characters";
const BRIDGE_URL = "http://127.0.0.1:3100/test/api/integrations/wecom/agent";
const REDIRECT_ORIGIN = "https://fh-bio.cn";

function delivery(overrides = {}) {
  return {
    id: 101,
    publicationId: "publication-1",
    attemptNo: 1,
    leaseToken: "11111111-1111-4111-8111-111111111111",
    leaseExpiresAt: "2026-07-31T01:00:00.000Z",
    destination: "zhangsan",
    title: "项目提醒",
    body: "项目已进入复核阶段。",
    href: "/work/projects/project-1",
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

test("worker signature covers timestamp, request id, method, pathname, and exact raw body", () => {
  const input = {
    secret: SECRET,
    timestamp: "1785430800000",
    requestId: "request-1",
    method: "post",
    pathname: "/test/api/integrations/wecom/notifications/claim",
    rawBody: '{"workerId":"worker-1","limit":1}',
  };
  const canonical = [
    input.timestamp,
    input.requestId,
    "POST",
    input.pathname,
    input.rawBody,
  ].join("\n");
  assert.equal(buildWecomWorkerCanonicalRequest(input), canonical);
  assert.equal(
    buildWecomWorkerSignature(input),
    createHmac("sha256", SECRET).update(canonical).digest("hex"),
  );
  assert.throws(
    () => buildWecomWorkerSignature({ ...input, secret: "too-short" }),
    /at least 32/,
  );
});

test("markdown neutralizes mentions and untrusted links while adding one controlled Workspace href", () => {
  const markdown = formatWecomNotificationMarkdown({
    title: "@all [伪造标题](https://evil.example/title) <@zhangsan>",
    body: "通知 @所有人\n![图片](https://evil.example/image)\nwww.evil.example",
    href: "/projects/project-1?watch=@all",
  }, {
    redirectOrigin: REDIRECT_ORIGIN,
    basePath: "/test",
  });

  assert.doesNotMatch(markdown, /@all/iu);
  assert.doesNotMatch(markdown, /<@/u);
  assert.doesNotMatch(markdown, /https:\/\/evil\.example/iu);
  assert.doesNotMatch(markdown, /www\.evil\.example/iu);
  assert.match(markdown, /＠所有人/u);
  assert.match(markdown, /https:\/\/fh-bio\.cn\/test\/projects\/project-1\?watch=%40all/u);
  assert.equal(
    workspaceNotificationHref("/test/projects/project-1", REDIRECT_ORIGIN, "/test"),
    "https://fh-bio.cn/test/projects/project-1",
  );
  assert.throws(
    () => workspaceNotificationHref("https://evil.example/project-1", REDIRECT_ORIGIN, "/test"),
    /HREF_EXTERNAL_OR_UNSAFE/,
  );
  assert.throws(
    () => workspaceNotificationHref("/api/private", REDIRECT_ORIGIN, "/test"),
    /HREF_API_PATH_FORBIDDEN/,
  );
});

test("WORKSPACE_PUBLIC_ORIGIN alone supports notification hrefs behind a base path", () => {
  const redirectOrigin = resolveWecomNotificationRedirectOrigin({
    WORKSPACE_PUBLIC_ORIGIN: "https://fh-bio.cn/test",
  });
  assert.equal(redirectOrigin, "https://fh-bio.cn");
  assert.match(
    formatWecomNotificationMarkdown(delivery(), {
      redirectOrigin,
      basePath: "/test",
    }),
    /https:\/\/fh-bio\.cn\/test\/work\/projects\/project-1/u,
  );
  assert.throws(
    () => resolveWecomNotificationRedirectOrigin({
      WORKSPACE_PUBLIC_ORIGIN: "https://user:password@fh-bio.cn/test",
    }),
    /REDIRECT_ORIGIN_INVALID/,
  );
});

test("successful delivery uses the injected WSClient and posts the frozen result DTO", async () => {
  const fetchCalls = [];
  const sends = [];
  let requestSequence = 0;
  const client = {
    async sendMessage(userid, body) {
      sends.push({ userid, body });
      return { headers: { req_id: "provider-request-1" } };
    },
  };
  const fetchImpl = async (url, options) => {
    const call = { url: String(url), options, body: JSON.parse(options.body) };
    fetchCalls.push(call);
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/claim")) {
      return jsonResponse({
        endpointKey: WECOM_NOTIFICATION_DELIVERY_CONTRACT.endpointKey,
        deliveries: [delivery()],
      });
    }
    if (pathname.endsWith("/result/101")) {
      return jsonResponse({ deliveryId: 101, status: "delivered" });
    }
    throw new Error("Unexpected URL " + url);
  };
  const worker = createWecomNotificationDeliveryWorker({
    client,
    bridgeUrl: BRIDGE_URL,
    bridgeSecret: SECRET,
    redirectOrigin: REDIRECT_ORIGIN,
    basePath: "/test",
    workerId: "worker-1",
    fetchImpl,
    logger: silentLogger,
    now: () => 1785430800000,
    requestIdFactory: () => "request-" + ++requestSequence,
  });

  assert.deepEqual(await worker.pollOnce(), {
    claimed: true,
    deliveryId: "101",
    outcome: "delivered",
  });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].userid, "zhangsan");
  assert.equal(sends[0].body.msgtype, "markdown");
  assert.match(sends[0].body.markdown.content, /https:\/\/fh-bio\.cn\/test\/work\/projects\/project-1/u);
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(fetchCalls[0].body, { workerId: "worker-1", limit: 1 });
  assert.deepEqual(fetchCalls[1].body, {
    workerId: "worker-1",
    leaseToken: "11111111-1111-4111-8111-111111111111",
    attemptNo: 1,
    outcome: "delivered",
    providerMessageId: "provider-request-1",
  });
  for (const call of fetchCalls) {
    assert.equal(call.options.headers["x-wecom-endpoint-key"], "wecom.primary");
    assert.match(call.options.headers["x-workspace-request-id"], /^request-\d+$/u);
    assert.equal(
      call.options.headers["x-workspace-signature"],
      buildWecomWorkerSignature({
        secret: SECRET,
        timestamp: call.options.headers["x-workspace-timestamp"],
        requestId: call.options.headers["x-workspace-request-id"],
        method: "POST",
        pathname: new URL(call.url).pathname.replace(/^\/test(?=\/|$)/u, "") || "/",
        rawBody: call.options.body,
      }),
    );
  }
});

test("a lost result response retries one stable receipt without sending the provider message twice", async () => {
  let sendCount = 0;
  let resultAttemptCount = 0;
  let requestSequence = 0;
  const resultRequests = [];
  const worker = createWecomNotificationDeliveryWorker({
    client: {
      async sendMessage() {
        sendCount += 1;
        return { headers: { req_id: "provider-once" } };
      },
    },
    bridgeUrl: BRIDGE_URL,
    bridgeSecret: SECRET,
    redirectOrigin: REDIRECT_ORIGIN,
    basePath: "/test",
    workerId: "worker-result-retry",
    fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/claim")) {
        return jsonResponse({
          endpointKey: "wecom.primary",
          deliveries: [delivery({ leaseExpiresAt: "2026-07-31T01:02:00.000Z" })],
        });
      }
      if (pathname.endsWith("/result/101")) {
        resultAttemptCount += 1;
        resultRequests.push({
          body: options.body,
          requestId: options.headers["x-workspace-request-id"],
        });
        if (resultAttemptCount === 1) throw new TypeError("simulated lost response");
        return jsonResponse({ deliveryId: 101, status: "delivered" });
      }
      throw new Error("Unexpected URL " + url);
    },
    logger: silentLogger,
    now: () => 1785430800000,
    requestIdFactory: () => "request-" + ++requestSequence,
    waitImpl: async () => {},
  });

  assert.equal((await worker.pollOnce()).outcome, "delivered");
  assert.equal(sendCount, 1);
  assert.equal(resultAttemptCount, 2);
  assert.equal(resultRequests[0].body, resultRequests[1].body);
  assert.equal(resultRequests[0].requestId, resultRequests[1].requestId);
});

test("response-body loss and invalid 200 acknowledgements retry only the frozen result receipt", async (t) => {
  for (const scenario of [
    {
      name: "response body disconnects after headers",
      firstResponse: () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new TypeError("simulated body disconnect");
        },
      }),
    },
    {
      name: "response body is empty",
      firstResponse: () => new Response("", { status: 200 }),
    },
    {
      name: "response body contains invalid JSON",
      firstResponse: () => new Response("{", { status: 200 }),
    },
  ]) {
    await t.test(scenario.name, async () => {
      let sendCount = 0;
      let resultAttemptCount = 0;
      const resultRequests = [];
      const worker = createWecomNotificationDeliveryWorker({
        client: {
          async sendMessage() {
            sendCount += 1;
            return { headers: { req_id: "provider-once" } };
          },
        },
        bridgeUrl: BRIDGE_URL,
        bridgeSecret: SECRET,
        redirectOrigin: REDIRECT_ORIGIN,
        basePath: "/test",
        workerId: "worker-result-body-retry",
        fetchImpl: async (url, options) => {
          const pathname = new URL(url).pathname;
          if (pathname.endsWith("/claim")) {
            return jsonResponse({
              endpointKey: "wecom.primary",
              deliveries: [delivery({ leaseExpiresAt: "2026-07-31T01:02:00.000Z" })],
            });
          }
          if (pathname.endsWith("/result/101")) {
            resultAttemptCount += 1;
            resultRequests.push({
              body: options.body,
              requestId: options.headers["x-workspace-request-id"],
            });
            if (resultAttemptCount === 1) return scenario.firstResponse();
            return jsonResponse({ deliveryId: 101, status: "delivered" });
          }
          throw new Error("Unexpected URL " + url);
        },
        logger: silentLogger,
        now: () => 1785430800000,
        requestIdFactory: () => "request-result-body",
        waitImpl: async () => {},
      });

      assert.equal((await worker.pollOnce()).outcome, "delivered");
      assert.equal(sendCount, 1);
      assert.equal(resultAttemptCount, 2);
      assert.equal(resultRequests[0].body, resultRequests[1].body);
      assert.equal(resultRequests[0].requestId, resultRequests[1].requestId);
    });
  }
});

test("retryable and permanent failures are reported once and leave retry policy to the server", async (t) => {
  async function runCase({ name, claimedDelivery, sendError, expectedOutcome, expectedCode, expectedSendCount }) {
    await t.test(name, async () => {
      const resultBodies = [];
      let sendCount = 0;
      const client = {
        async sendMessage() {
          sendCount += 1;
          throw sendError;
        },
      };
      const fetchImpl = async (url, options) => {
        const pathname = new URL(url).pathname;
        if (pathname.endsWith("/claim")) {
          return jsonResponse({
            endpointKey: "wecom.primary",
            deliveries: [claimedDelivery],
          });
        }
        if (pathname.includes("/result/")) {
          resultBodies.push(JSON.parse(options.body));
          return jsonResponse({
            deliveryId: claimedDelivery.id,
            status: expectedOutcome === "retryable_failure" ? "retrying" : "failed",
          });
        }
        throw new Error("Unexpected URL " + url);
      };
      const worker = createWecomNotificationDeliveryWorker({
        client,
        bridgeUrl: BRIDGE_URL,
        bridgeSecret: SECRET,
        redirectOrigin: REDIRECT_ORIGIN,
        basePath: "/test",
        workerId: "worker-failure",
        fetchImpl,
        logger: silentLogger,
      });

      const result = await worker.pollOnce();
      assert.equal(result.outcome, expectedOutcome);
      assert.equal(sendCount, expectedSendCount);
      assert.equal(resultBodies.length, 1);
      assert.equal(resultBodies[0].outcome, expectedOutcome);
      assert.equal(resultBodies[0].errorCode, expectedCode);
      assert.doesNotMatch(resultBodies[0].errorSummary, /secret|lease|zhangsan/iu);
    });
  }

  await runCase({
    name: "provider rejection defaults to retryable",
    claimedDelivery: delivery({ id: 102 }),
    sendError: { errcode: 45009, errmsg: "provider detail must not cross the bridge" },
    expectedOutcome: "retryable_failure",
    expectedCode: "WECOM_45009",
    expectedSendCount: 1,
  });
  await runCase({
    name: "unsafe payload is permanent without contacting WeCom",
    claimedDelivery: delivery({
      id: 103,
      href: "https://evil.example/project-1",
    }),
    sendError: new Error("must not be used"),
    expectedOutcome: "permanent_failure",
    expectedCode: "HREF_EXTERNAL_OR_UNSAFE",
    expectedSendCount: 0,
  });
});

test("polling is single-flight and stop drains an in-flight send before reporting disconnected", async () => {
  let releaseClaim;
  const claimGate = new Promise((resolve) => {
    releaseClaim = resolve;
  });
  let claimCount = 0;
  const singleFlightFetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/claim")) {
      claimCount += 1;
      await claimGate;
      return jsonResponse({ endpointKey: "wecom.primary", deliveries: [] });
    }
    throw new Error("Unexpected URL " + url + " " + options.method);
  };
  const singleFlightWorker = createWecomNotificationDeliveryWorker({
    client: { async sendMessage() {} },
    bridgeUrl: BRIDGE_URL,
    bridgeSecret: SECRET,
    redirectOrigin: REDIRECT_ORIGIN,
    basePath: "/test",
    workerId: "worker-single-flight",
    fetchImpl: singleFlightFetch,
    logger: silentLogger,
  });
  const first = singleFlightWorker.pollOnce();
  const second = singleFlightWorker.pollOnce();
  assert.equal(first, second);
  assert.equal(claimCount, 1);
  releaseClaim();
  await Promise.all([first, second]);
  assert.equal(claimCount, 1);

  let releaseSend;
  let markSendStarted;
  const sendStarted = new Promise((resolve) => {
    markSendStarted = resolve;
  });
  const sendGate = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const heartbeatStates = [];
  let loopClaimCount = 0;
  const loopFetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/heartbeat")) {
      heartbeatStates.push(JSON.parse(options.body).connected);
      return jsonResponse({ workerId: "worker-loop" });
    }
    if (pathname.endsWith("/claim")) {
      loopClaimCount += 1;
      return jsonResponse({
        endpointKey: "wecom.primary",
        deliveries: [delivery({ id: 104 })],
      });
    }
    if (pathname.endsWith("/result/104")) {
      return jsonResponse({ deliveryId: 104, status: "delivered" });
    }
    throw new Error("Unexpected URL " + url);
  };
  const loopWorker = createWecomNotificationDeliveryWorker({
    client: {
      async sendMessage() {
        markSendStarted();
        await sendGate;
        return { headers: { req_id: "provider-loop" } };
      },
    },
    bridgeUrl: BRIDGE_URL,
    bridgeSecret: SECRET,
    redirectOrigin: REDIRECT_ORIGIN,
    basePath: "/test",
    workerId: "worker-loop",
    fetchImpl: loopFetch,
    logger: silentLogger,
    pollIntervalMs: 60_000,
  });
  assert.equal(loopWorker.start(), true);
  await sendStarted;
  const stopping = loopWorker.stop();
  assert.equal(loopWorker.isRunning(), false);
  assert.equal(loopClaimCount, 1);
  releaseSend();
  await stopping;
  assert.equal(loopClaimCount, 1);
  assert.deepEqual(heartbeatStates, [true, false]);
});
