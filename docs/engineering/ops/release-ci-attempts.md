# Release CI attempt receipts

Every `publish.sh ci` invocation must produce one run-scoped immutable attempt receipt, whether the run succeeds or fails. The receipt is operational evidence for CI only; `deploy` consumes an existing Application Ready receipt and must not create, mutate, or patrol CI attempts.

## Storage and identity

Final receipts live below this gitignored path:

```text
.cache/release-attempts/<target>/<target-mode>/<run-id>.json
```

The sibling `<run-id>.draft.json` is mutable only while that run is active. The final file is created with exclusive-create semantics, made read-only, and never overwritten. It binds:

- run ID, deploy target, target mode, start/completion time, and process exit code;
- source commit, source tree, release content digest, and configuration digest once candidate freeze succeeds;
- every required lane's status, timing, stable command digest, evidence-file digest, and lane receipt digest;
- blocker resolutions, superseded failed attempts, and resolved fingerprints that recur.

Candidate identity may remain `null` only when candidate freeze itself fails. Finalization converts an active lane to `failed/unexpected-exit` and every unstarted lane to `blocked`, so shell exits cannot leave an apparently active attempt.

## Lane contract

The required full-release lanes are:

1. `candidate-freeze`
2. `artifact-preflight`
3. `database`
4. `candidate-evidence`
5. `source`
6. `artifact-build`
7. `static-acceptance`
8. `rehearsal`
9. `application-ready`

`source` and `artifact-build` have independent state and receipts. One lane failing must not erase evidence already produced by the other lane. Dependency skips are recorded as `blocked`; an unchanged exact receipt may be recorded as `reused`.

The `candidate-evidence` lane also writes the execution plan. Parallel source/artifact execution is allowed only for a unit-private delta from `.cache/release-baselines/<target>/<mode>/current.json`, which advances only after a successful deploy matching the exact Application Ready. Missing, invalid, non-ancestor, shared, unknown, or monolith baselines select the serial strategy.

The CI entrypoint sources `ops/release/attempts/ci-attempt-shell.sh`, calls `release_ci_attempt_begin` immediately after selector parsing, and then starts/binds/finishes lanes at their existing boundaries. The installed `EXIT` trap is the single finalization path. Do not add a second finalizer to child scripts.

## Blocker fingerprint and patrol

A failed lane stores a stable error code, integer exit code, and the digest of its normalized lane log. The fingerprint input is:

```text
lane + NUL + commandDigest + NUL + errorCode + NUL + exitCode + NUL + normalizedMessageDigest
```

A later `passed` or `reused` result resolves an earlier fingerprint only when target, target mode, lane, and command digest all match. The successful receipt records the failed run ID, fixing run ID, and fixing commit. If a resolved fingerprint appears again, finalization still writes the failing receipt and exits `42` as a P1 recurrence.

Run a standalone history patrol with:

```bash
node ops/release/attempts/ci-attempt.mjs patrol \
  --history-root .cache/release-attempts
```

Exit `0` means no resolved fingerprint recurred. Exit `42` means at least one P1 recurrence exists and Application Ready must not be signed.

任何 deploy 阶段暴露的长期缺陷都必须先转成 CI/Controller Ready 可复现的合同再关闭：例如 deploy-tool import 缺失进入 named bundle closure fixture，archive 隔离用户不可读进入 tar mode fixture。只在生产脚本里补文件名或 chmod、却没有前置失败 fixture，不算 resolution，也不得再次部署。

## Sensitive-data boundary

Attempt receipts never contain command output, exception messages, environment variables, request headers, tokens, or secret-bearing command lines. Callers supply a stable command ID and a slug error code, not a raw command or log excerpt. Evidence contains only a repository-relative file path, SHA-256 digest, kind, and byte size.

Each captured lane mirrors output to the operator console and writes a mode-`0600` run-scoped log beside the receipt:

```text
.cache/release-attempts/<target>/<target-mode>/<run-id>.<lane>.log
```

Only the log path and SHA-256 are stored as receipt evidence. Before fingerprinting, volatile timestamps, PIDs, ports, temporary paths, and source identifiers are normalized; different failures with the same exit code therefore remain distinct, while the same failure across new runs keeps one stable fingerprint.

## Fast verification

The attempt contract is covered without a build, database, or network dependency:

```bash
node --test ops/release/attempts/ci-attempt.test.mjs
node --test ops/release/readiness/artifact-static-acceptance.test.mjs
node --test ops/publish-contract.test.mjs
bash -n ops/release/attempts/ci-attempt-shell.sh
```

The tests cover immutable success/failure receipts, lane timing and evidence digests, blocked lanes, secret-field rejection, exact blocker resolution, same-exit-code failure separation, recurrence P1, one candidate snapshot receipt, real archive static acceptance, all nine published lane boundaries, and the shell `EXIT` trap.
