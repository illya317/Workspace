#!/usr/bin/env bash
set -euo pipefail
umask 077

command="${1:-install}"
server_dir="${WORKSPACE_POSTGRESQL_TLS_SERVER_DIR:-/etc/postgresql/16/main/tls}"
client_dir="${WORKSPACE_POSTGRESQL_TLS_CLIENT_DIR:-/etc/workspace/postgresql}"
server_owner="${WORKSPACE_POSTGRESQL_TLS_SERVER_OWNER:-postgres}"
server_group="${WORKSPACE_POSTGRESQL_TLS_SERVER_GROUP:-postgres}"
dns_names="${WORKSPACE_POSTGRESQL_TLS_DNS_NAMES:-localhost}"
ip_addresses="${WORKSPACE_POSTGRESQL_TLS_IP_ADDRESSES:-127.0.0.1}"
renew_before_seconds="${WORKSPACE_POSTGRESQL_TLS_RENEW_BEFORE_SECONDS:-2592000}"
valid_days="${WORKSPACE_POSTGRESQL_TLS_VALID_DAYS:-397}"

fail() {
  printf '[postgres-tls] %s\n' "$1" >&2
  exit 1
}

case "$command" in install|rotate|check) ;; *) fail "usage: tls-bootstrap.sh install|rotate|check" ;; esac
[ "$(id -u)" -eq 0 ] || fail "TLS bootstrap must run as root"
for path in "$server_dir" "$client_dir"; do
  case "$path" in /*) ;; *) fail "TLS directories must be absolute" ;; esac
  [ "$path" != / ] || fail "TLS directory must not be /"
done
[[ "$renew_before_seconds" =~ ^[0-9]+$ ]] || fail "renew threshold must be numeric"
[[ "$valid_days" =~ ^[0-9]+$ ]] || fail "valid days must be numeric"

ca_key="$client_dir/ca.key"
ca_cert="$client_dir/ca.pem"
server_releases_dir="$server_dir/releases"
server_current_link="$server_dir/current"
server_key="$server_current_link/server.key"
server_cert="$server_current_link/server.crt"

check_certificate_pair() {
  local key_path="$1" cert_path="$2" quiet="${3:-0}"
  [ -r "$ca_cert" ] || fail "CA certificate is missing"
  [ -r "$cert_path" ] || fail "server certificate is missing"
  [ -r "$key_path" ] || fail "server key is missing"
  openssl verify -CAfile "$ca_cert" "$cert_path" >/dev/null
  openssl x509 -checkend "$renew_before_seconds" -noout -in "$cert_path" >/dev/null \
    || fail "server certificate expires within the configured threshold"
  key_public_sha="$(openssl pkey -in "$key_path" -pubout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  cert_public_sha="$(openssl x509 -in "$cert_path" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  [ -n "$key_public_sha" ] && [ "$key_public_sha" = "$cert_public_sha" ] || fail "server key does not match certificate"
  cert_text="$(openssl x509 -in "$cert_path" -noout -text)"
  IFS=',' read -ra dns_values <<<"$dns_names"
  for value in "${dns_values[@]}"; do
    value="${value//[[:space:]]/}"
    [ -z "$value" ] || grep -Fq "DNS:$value" <<<"$cert_text" || fail "certificate is missing DNS SAN $value"
  done
  IFS=',' read -ra ip_values <<<"$ip_addresses"
  for value in "${ip_values[@]}"; do
    value="${value//[[:space:]]/}"
    [ -z "$value" ] || grep -Fq "IP Address:$value" <<<"$cert_text" || fail "certificate is missing IP SAN $value"
  done
  key_mode="$(stat -c '%a' "$key_path")"
  [ "$key_mode" = 600 ] || fail "server key mode must be 600"
  [ "$(stat -c '%U:%G' "$key_path")" = "$server_owner:$server_group" ] || fail "server key owner is invalid"
  [ "$(stat -c '%U:%G' "$cert_path")" = "$server_owner:$server_group" ] || fail "server certificate owner is invalid"
  [ "$quiet" = 1 ] || printf '[postgres-tls] certificate check passed\n'
}

check_certificate() {
  [ -L "$server_current_link" ] || fail "server TLS current release link is missing"
  current_release="$(readlink -f "$server_current_link")"
  case "$current_release" in "$server_releases_dir"/*) ;; *) fail "server TLS current link escapes the releases directory" ;; esac
  check_certificate_pair "$server_key" "$server_cert"
}

if [ "$command" = check ]; then
  check_certificate
  exit 0
fi

install -d -m 0755 -o root -g root "$client_dir"
install -d -m 0700 -o "$server_owner" -g "$server_group" "$server_dir"
install -d -m 0700 -o "$server_owner" -g "$server_group" "$server_releases_dir"
if [ "$command" = install ] && { [ -e "$server_current_link" ] || [ -e "$server_dir/server.key" ] || [ -e "$server_dir/server.crt" ]; }; then
  fail "server TLS material already exists; use rotate explicitly"
fi

temporary="$(mktemp -d "$client_dir/.tls-build.XXXXXXXX")"
swapped=0
committed=0
previous_target=""
release_dir=""
cleanup() {
  if [ "$swapped" = 1 ] && [ "$committed" = 0 ]; then
    rollback_link="$server_dir/.current-rollback-$$"
    if [ -n "$previous_target" ]; then
      ln -s "$previous_target" "$rollback_link"
      mv -Tf "$rollback_link" "$server_current_link"
    elif [ "$(readlink -f "$server_current_link" 2>/dev/null || true)" = "$release_dir" ]; then
      rm -f -- "$server_current_link"
    fi
  fi
  case "$temporary" in "$client_dir"/.tls-build.*) rm -rf -- "$temporary" ;; esac
  if [ "$committed" = 0 ] && [ -n "$release_dir" ] && [ -d "$release_dir" ]; then
    case "$release_dir" in "$server_releases_dir"/*) rm -rf -- "$release_dir" ;; esac
  fi
}
trap cleanup EXIT

if [ ! -e "$ca_key" ] || [ ! -e "$ca_cert" ]; then
  [ ! -e "$ca_key" ] && [ ! -e "$ca_cert" ] || fail "CA key/certificate pair is incomplete"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$temporary/ca.key" >/dev/null 2>&1
  openssl req -x509 -new -sha256 -days 3650 \
    -key "$temporary/ca.key" \
    -subj '/CN=Workspace PostgreSQL Local CA' \
    -out "$temporary/ca.pem"
  install -m 0600 -o root -g root "$temporary/ca.key" "$ca_key"
  install -m 0644 -o root -g root "$temporary/ca.pem" "$ca_cert"
fi

san_entries=()
index=1
IFS=',' read -ra dns_values <<<"$dns_names"
for value in "${dns_values[@]}"; do
  value="${value//[[:space:]]/}"
  if [ -n "$value" ]; then san_entries+=("DNS.$index = $value"); index=$((index + 1)); fi
done
index=1
IFS=',' read -ra ip_values <<<"$ip_addresses"
for value in "${ip_values[@]}"; do
  value="${value//[[:space:]]/}"
  if [ -n "$value" ]; then san_entries+=("IP.$index = $value"); index=$((index + 1)); fi
done
[ "${#san_entries[@]}" -gt 0 ] || fail "at least one SAN is required"

{
  printf '%s\n' '[req]' 'prompt = no' 'distinguished_name = subject' 'req_extensions = extensions'
  printf '%s\n' '[subject]' 'CN = Workspace PostgreSQL'
  printf '%s\n' '[extensions]' 'basicConstraints = critical,CA:FALSE' 'keyUsage = critical,digitalSignature,keyEncipherment' 'extendedKeyUsage = serverAuth' 'subjectAltName = @alt_names'
  printf '%s\n' '[alt_names]'
  printf '%s\n' "${san_entries[@]}"
} >"$temporary/server.cnf"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$temporary/server.key" >/dev/null 2>&1
openssl req -new -sha256 -key "$temporary/server.key" -config "$temporary/server.cnf" -out "$temporary/server.csr"
openssl x509 -req -sha256 -days "$valid_days" \
  -in "$temporary/server.csr" \
  -CA "$ca_cert" \
  -CAkey "$ca_key" \
  -CAcreateserial \
  -extfile "$temporary/server.cnf" \
  -extensions extensions \
  -out "$temporary/server.crt" >/dev/null
openssl verify -CAfile "$ca_cert" "$temporary/server.crt" >/dev/null
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
release_dir="$server_releases_dir/$release_id"
[ ! -e "$release_dir" ] || fail "TLS release already exists"
install -d -m 0700 -o "$server_owner" -g "$server_group" "$release_dir"
install -m 0600 -o "$server_owner" -g "$server_group" "$temporary/server.key" "$release_dir/server.key"
install -m 0644 -o "$server_owner" -g "$server_group" "$temporary/server.crt" "$release_dir/server.crt"
check_certificate_pair "$release_dir/server.key" "$release_dir/server.crt" 1

if [ -L "$server_current_link" ]; then
  previous_target="$(readlink "$server_current_link")"
elif [ -e "$server_current_link" ]; then
  fail "server TLS current path exists but is not a symlink"
fi
next_link="$server_dir/.current-$release_id"
ln -s "releases/$release_id" "$next_link"
mv -Tf "$next_link" "$server_current_link"
swapped=1
rm -f "$client_dir/ca.srl"
check_certificate
committed=1
printf '[postgres-tls] installed server certificate without changing PostgreSQL configuration\n'
