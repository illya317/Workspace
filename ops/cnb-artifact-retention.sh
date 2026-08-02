#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
PACKAGE="${2:-}"
KEEP_COUNT="${3:-}"
PACKAGE_KIND="${4:-}"

fail() { echo "[错误] $*" >&2; exit 1; }
require() { [ -n "${!1:-}" ] || fail "缺少 $1"; }

select_one_old_tag() {
  for key in CNB_TOKEN CNB_REPO_SLUG_LOWERCASE; do require "$key"; done
  [[ "$PACKAGE" =~ ^[a-z0-9._/-]+$ ]] || fail "制品包名非法"
  [[ "$KEEP_COUNT" =~ ^[1-9][0-9]*$ ]] || fail "保留数量必须是正整数"
  case "$PACKAGE_KIND" in application|environment) ;; *) fail "未知制品类型: $PACKAGE_KIND" ;; esac

  work_dir="$(mktemp -d)"
  ssh_key=""
  cleanup() {
    rm -rf "$work_dir"
    [ -z "$ssh_key" ] || [ "${KEY:-}" = "$ssh_key" ] || rm -f "$ssh_key"
  }
  trap cleanup EXIT
  tags_file="$work_dir/tags.ndjson"
  receipt_file="$work_dir/deployed-image.json"
  : > "$tags_file"

  current_digest=""
  previous_digest=""
  if [ "$PACKAGE_KIND" = application ]; then
    for key in SERVER REMOTE_DIR; do require "$key"; done
    if [ -n "${KEY:-}" ]; then
      ssh_key="$KEY"
    elif [ -n "${KEY_CONTENT:-}" ]; then
      ssh_key="$work_dir/deploy-key"
      printf '%s\n' "$KEY_CONTENT" > "$ssh_key"
      chmod 600 "$ssh_key"
    else
      fail "缺少 KEY/KEY_CONTENT"
    fi
    case "$REMOTE_DIR" in *[!A-Za-z0-9_./\ -]*) fail "REMOTE_DIR 包含不安全字符" ;; esac
    ssh -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "$SERVER" "cat '$REMOTE_DIR/.workspace/deployed-image.json'" > "$receipt_file"
    current_digest="$(jq -er '.current.imageDigest | select(test("^sha256:[0-9a-f]{64}$"))' "$receipt_file")"
    previous_digest="$(jq -r '.previous.imageDigest // empty' "$receipt_file")"
    [ -z "$previous_digest" ] || [[ "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
      || fail "生产回执 previous digest 非法"
  fi

  encoded_package="$(jq -rn --arg value "$PACKAGE" '$value|@uri')"
  page=1
  while [ "$page" -le 100 ]; do
    response="$work_dir/page-$page.json"
    curl --fail-with-body --silent --show-error --get \
      --header 'accept: application/vnd.cnb.api+json' \
      --header "Authorization: Bearer ${CNB_TOKEN}" \
      --data-urlencode "page=$page" --data-urlencode 'page_size=100' \
      "https://api.cnb.cool/${CNB_REPO_SLUG_LOWERCASE}/-/packages/docker/${encoded_package}/-/tags" \
      > "$response"
    jq -e '.docker | type == "array"' "$response" >/dev/null \
      || fail "CNB 制品标签响应格式非法"
    jq -c '.docker[]?' "$response" >> "$tags_file"
    count="$(jq '.docker | length' "$response")"
    [ "$count" -eq 100 ] || break
    page=$((page + 1))
  done
  [ "$page" -le 100 ] || fail "CNB 制品标签分页超过安全上限"

  tag_pattern='^.+$'
  [ "$PACKAGE_KIND" = environment ] || tag_pattern='^sha-[0-9a-f]{40}$'
  delete_tag="$(jq -rs \
    --arg current "$current_digest" --arg previous "$previous_digest" \
    --arg pattern "$tag_pattern" --argjson keep "$KEEP_COUNT" '
      map(select((.name // "") | test($pattern)))
      | sort_by(.last_pusher.push_at // "") | reverse
      | . as $all
      | (
          [$all[:$keep][]?.name]
          + [$all[] | select(.guarded == true) | .name]
          + [$all[] as $item
              | select(([$item.images[]?.digest] | index($current)) != null
                    or ([$item.images[]?.digest] | index($previous)) != null)
              | $item.name]
        ) | unique as $protected
      | [$all[] as $item | select(($protected | index($item.name)) == null) | $item]
      | sort_by(.last_pusher.push_at // "")
      | .[0].name // empty
    ' "$tags_file")"
  printf '%s' "$delete_tag"
}

case "$ACTION" in
  select-one) select_one_old_tag ;;
  *) fail "用法: $0 select-one <package> <keep-count> <application|environment>" ;;
esac
