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


remote_dir = Path(required("REMOTE_DIR"))
build = required("DEPLOY_SOURCE_SHA")
plan_id = required("RELEASE_PLAN_ID")
stage = required("RELEASE_STAGE")
status = required("DEPLOY_STATUS")
transport = required("DEPLOY_TRANSPORT")
started = int(required("DEPLOY_STARTED_EPOCH_SECONDS"))
duration = int(required("DEPLOY_DURATION_SECONDS"))
exit_code = int(os.environ.get("DEPLOY_EXIT_CODE", "0"))
release_started_at = required("RELEASE_PROCESS_STARTED_AT")
finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
event_id = f"release:{plan_id}:{stage}:{status}:{started}"
release_started = datetime.datetime.fromisoformat(release_started_at.replace("Z", "+00:00"))
payload = {
    "schemaVersion": 3,
    "kind": "workspace-deploy-event",
    "id": event_id,
    "transport": transport,
    "deploymentKind": "full",
    "deploymentMode": "full",
    "action": "deploy",
    "stage": stage,
    "status": status,
    "package": "unknown",
    "build": build,
    "release": plan_id,
    "durationSeconds": duration,
    "opsDurationSeconds": max(0, round((datetime.datetime.now(datetime.timezone.utc) - release_started).total_seconds())),
    "exitCode": exit_code,
    "startedAtEpochSeconds": started,
    "startedAt": datetime.datetime.fromtimestamp(started, datetime.timezone.utc).isoformat(),
    "releaseStartedAt": release_started_at,
    "finishedAt": finished_at,
}
if os.environ.get("DEPLOY_TEST_EVENT") == "1":
    payload["test"] = True


def atomic_write(target: Path, body: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
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
print(f"Workspace release event queued: {event_id} ({status}, {duration}s)")
