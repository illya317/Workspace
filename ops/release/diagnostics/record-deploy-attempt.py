import datetime
import hashlib
import json
import os
import time
from pathlib import Path


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def parse_instant(name: str) -> tuple[str, datetime.datetime]:
    value = required(name)
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise RuntimeError(f"{name} is invalid") from error
    if parsed.tzinfo is None:
        raise RuntimeError(f"{name} must include timezone")
    return value, parsed.astimezone(datetime.timezone.utc)


def optional_instant(name: str) -> tuple[str | None, datetime.datetime | None]:
    value = os.environ.get(name, "").strip()
    if not value:
        return None, None
    parsed_value, parsed = parse_instant(name)
    return parsed_value, parsed


def nonnegative_int(name: str, *, optional: bool = False) -> int | None:
    value = os.environ.get(name, "").strip()
    if optional and not value:
        return None
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name} is invalid") from error
    if parsed < 0:
        raise RuntimeError(f"{name} must be nonnegative")
    return parsed


remote_dir = Path(required("REMOTE_DIR"))
build = required("DEPLOY_SOURCE_SHA")
plan_id = required("RELEASE_PLAN_ID")
stage = required("RELEASE_STAGE")
status = required("DEPLOY_STATUS")
transport = required("DEPLOY_TRANSPORT")
if status not in {"running", "succeeded", "failed", "cancelled"}:
    raise RuntimeError("DEPLOY_STATUS is invalid")
requested_at, requested_time = parse_instant("DEPLOY_REQUESTED_AT")
mutation_started_at, mutation_started_time = optional_instant("DEPLOY_MUTATION_STARTED_AT")
finished_at, finished_time = parse_instant("DEPLOY_FINISHED_AT")
end_to_end_duration = nonnegative_int("DEPLOY_END_TO_END_DURATION_SECONDS")
mutation_duration = nonnegative_int("DEPLOY_MUTATION_DURATION_SECONDS", optional=True)
if abs((finished_time - requested_time).total_seconds() - end_to_end_duration) > 1:
    raise RuntimeError("end-to-end deploy duration does not match timestamps")
if (mutation_started_time is None) != (mutation_duration is None):
    raise RuntimeError("mutation timestamp and duration must be present together")
if mutation_started_time is not None and abs((finished_time - mutation_started_time).total_seconds() - mutation_duration) > 1:
    raise RuntimeError("mutation deploy duration does not match timestamps")
exit_code = int(os.environ.get("DEPLOY_EXIT_CODE", "0"))
release_started_at = required("RELEASE_PROCESS_STARTED_AT")
current_phase = required("DEPLOY_CURRENT_PHASE")
target_id = os.environ.get("DEPLOY_TARGET_ID", "monolith").strip() or "monolith"
target_mode = os.environ.get("DEPLOY_TARGET_MODE", "activate").strip() or "activate"
soft_threshold_exceeded = os.environ.get("DEPLOY_SOFT_THRESHOLD_EXCEEDED") == "1"
event_id = f"release:{plan_id}:{stage}:{status}:{requested_at}"
release_started = datetime.datetime.fromisoformat(release_started_at.replace("Z", "+00:00"))
payload = {
    "schemaVersion": 4,
    "kind": "workspace-deploy-event",
    "id": event_id,
    "transport": transport,
    "deploymentKind": "full" if target_id == "monolith" else "unit",
    "deploymentMode": "full" if target_id == "monolith" else target_mode,
    "action": "deploy",
    "stage": stage,
    "status": status,
    "package": "unknown",
    "build": build,
    "release": plan_id,
    "endToEndDurationSeconds": end_to_end_duration,
    "mutationDurationSeconds": mutation_duration,
    "exitCode": exit_code,
    "deployRequestedAt": requested_at,
    "startedAt": requested_at,
    "mutationStartedAt": mutation_started_at,
    "releaseStartedAt": release_started_at,
    "finishedAt": finished_at,
    "currentPhase": current_phase,
    "softThresholdExceeded": soft_threshold_exceeded,
    "timing": {
        "endToEndSeconds": end_to_end_duration,
        "mutationSeconds": mutation_duration,
        "releaseProcessSeconds": max(0, round((finished_time - release_started).total_seconds())),
    },
    "control": {
        "sourceSha": required("DEPLOY_CONTROL_SOURCE_SHA"),
        "treeId": required("DEPLOY_CONTROL_TREE_ID"),
        "digest": required("DEPLOY_CONTROL_DIGEST"),
    },
}
if target_id != "monolith":
    payload["modules"] = [{"unitId": target_id, "moduleKeys": [target_id], "moduleLabels": []}]
if status == "succeeded":
    payload["acceptance"] = {"health": "passed", "version": "passed", "contentDigest": "passed"}
if status in {"failed", "cancelled"}:
    fingerprint_input = f"{current_phase}:{exit_code}".encode()
    payload["errorFingerprint"] = hashlib.sha256(fingerprint_input).hexdigest()[:16]
if os.environ.get("DEPLOY_TEST_EVENT") == "1":
    payload["test"] = True


def atomic_write(target: Path, body: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if target.parent != Path.home():
        os.chmod(target.parent, 0o700)
    temporary = target.with_name(f".{target.name}.tmp-{os.getpid()}")
    temporary.write_text(body)
    os.chmod(temporary, 0o600)
    temporary.replace(target)


body = json.dumps(payload, ensure_ascii=False)
atomic_write(Path.home() / ".finance-bot-deploy-event.json", body)
queue_root = Path.home() / ".finance-bot-deploy-events" / "pending"
event_digest = hashlib.sha256(event_id.encode()).hexdigest()[:16]
atomic_write(queue_root / f"{time.time_ns()}-{event_digest}.json", body)

history_root = remote_dir / ".workspace" / "deployment-history"
history_root.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(history_root, 0o700)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
atomic_write(history_root / f"{stamp}-{build[:12]}-{stage}-{status}.json", body)
atomic_write(history_root / "latest-release-event.json", body)
history_log = history_root / "release-events.ndjson"
with history_log.open("a") as handle:
    handle.write(body + "\n")
os.chmod(history_log, 0o600)
print(f"Workspace release event queued: {event_id} ({status}, end-to-end={end_to_end_duration}s, mutation={mutation_duration})")
