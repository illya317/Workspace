import datetime
import json
import os
from pathlib import Path

remote_dir = Path(os.environ["REMOTE_DIR"])
build = os.environ["DEPLOY_SOURCE_SHA"]
started = int(os.environ["DEPLOY_STARTED_EPOCH_SECONDS"])
duration = int(os.environ["DEPLOY_DURATION_SECONDS"])
status = os.environ["DEPLOY_STATUS"]
exit_code = int(os.environ["DEPLOY_EXIT_CODE"])
transport = os.environ["DEPLOY_TRANSPORT"]
finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
event_id = f"attempt:{build}:{started}"
payload = {
    "schemaVersion": 2,
    "kind": "workspace-deploy-event",
    "id": event_id,
    "transport": transport,
    "deploymentKind": "full",
    "deploymentMode": "full",
    "action": "deploy",
    "status": status,
    "package": "unknown",
    "build": build,
    "release": f"attempt-{build[:12]}",
    "durationSeconds": duration,
    "opsDurationSeconds": duration,
    "exitCode": exit_code,
    "startedAtEpochSeconds": started,
    "finishedAt": finished_at,
}


def atomic_write(target: Path, body: str) -> None:
    temporary = target.with_name(f".{target.name}.tmp-{os.getpid()}")
    temporary.write_text(body)
    os.chmod(temporary, 0o600)
    temporary.replace(target)


body = json.dumps(payload, ensure_ascii=False)
target = Path.home() / ".finance-bot-deploy-event.json"
atomic_write(target, body)
history_root = remote_dir / ".workspace" / "deployment-history"
history_root.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(history_root, 0o700)
latest = history_root / "latest.json"
duplicate = False
if latest.exists():
    try:
        duplicate = json.loads(latest.read_text()).get("id") == event_id
    except (OSError, ValueError):
        pass
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
atomic_write(history_root / f"{stamp}-{build[:12]}-{status}.json", body)
atomic_write(latest, body)
if not duplicate:
    with (history_root / "deployments.ndjson").open("a") as handle:
        handle.write(body + "\n")
    os.chmod(history_root / "deployments.ndjson", 0o600)
print(f"Workspace deploy attempt recorded: {event_id} ({status}, {duration}s)")
