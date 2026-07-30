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
server_key="$server_dir/server.key"
server_cert="$server_dir/server.crt"

check_certificate() {
  [ -r "$ca_cert" ] || fail "CA certificate is missing"
  [ -r "$server_cert" ] || fail "server certificate is missing"
  [ -r "$server_key" ] || fail "server key is missing"
  openssl verify -CAfile "$ca_cert" "$server_cert" >/dev/null
  openssl x509 -checkend "$renew_before_seconds" -noout -in "$server_cert" >/dev/null \
    || fail "server certificate expires within the configured threshold"
  cert_text="$(openssl x509 -in "$server_cert" -noout -text)"
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
  key_mode="$(stat -c '%a' "$server_key")"
  [ "$key_mode" = 600 ] || fail "server key mode must be 600"
  printf '[postgres-tls] certificate check passed\n'
}

if [ "$command" = check ]; then
  check_certificate
  exit 0
fi

install -d -m 0755 -o root -g root "$client_dir"
install -d -m 0700 -o "$server_owner" -g "$server_group" "$server_dir"
if [ "$command" = install ] && { [ -e "$server_key" ] || [ -e "$server_cert" ]; }; then
  fail "server TLS material already exists; use rotate explicitly"
fi

temporary="$(mktemp -d "$client_dir/.tls-build.XXXXXXXX")"
cleanup() {
  case "$temporary" in "$client_dir"/.tls-build.*) rm -rf -- "$temporary" ;; esac
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

if [ -e "$server_key" ] || [ -e "$server_cert" ]; then
  backup_dir="$server_dir/archive/$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 0700 -o root -g root "$backup_dir"
  [ ! -e "$server_key" ] || install -m 0600 -o root -g root "$server_key" "$backup_dir/server.key"
  [ ! -e "$server_cert" ] || install -m 0600 -o root -g root "$server_cert" "$backup_dir/server.crt"
fi

install -m 0600 -o "$server_owner" -g "$server_group" "$temporary/server.key" "$server_dir/server.key.new"
install -m 0644 -o "$server_owner" -g "$server_group" "$temporary/server.crt" "$server_dir/server.crt.new"
mv -f "$server_dir/server.key.new" "$server_key"
mv -f "$server_dir/server.crt.new" "$server_cert"
rm -f "$client_dir/ca.srl"
check_certificate
printf '[postgres-tls] installed server certificate without changing PostgreSQL configuration\n'
