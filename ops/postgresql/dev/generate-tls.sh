#!/usr/bin/env bash
set -euo pipefail

target_dir="${1:-./tls}"
umask 077
mkdir -p "${target_dir}"

for certificate_file in ca.key ca.crt server.key server.crt; do
  if [[ -e "${target_dir}/${certificate_file}" ]]; then
    echo "Refusing to overwrite existing TLS material: ${target_dir}/${certificate_file}" >&2
    exit 1
  fi
done

temporary_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${temporary_dir}"
}
trap cleanup EXIT

openssl genrsa -out "${target_dir}/ca.key" 4096
openssl req -x509 -new -sha256 -days 3650 \
  -key "${target_dir}/ca.key" \
  -subj "/CN=workspace-dev-postgresql-ca" \
  -out "${target_dir}/ca.crt"

openssl genrsa -out "${target_dir}/server.key" 3072
openssl req -new -sha256 \
  -key "${target_dir}/server.key" \
  -subj "/CN=db" \
  -out "${temporary_dir}/server.csr"
printf '%s\n' \
  'subjectAltName=DNS:db' \
  'extendedKeyUsage=serverAuth' \
  'keyUsage=digitalSignature,keyEncipherment' \
  > "${temporary_dir}/server.ext"
openssl x509 -req -sha256 -days 825 \
  -in "${temporary_dir}/server.csr" \
  -CA "${target_dir}/ca.crt" \
  -CAkey "${target_dir}/ca.key" \
  -CAcreateserial \
  -extfile "${temporary_dir}/server.ext" \
  -out "${target_dir}/server.crt"

chmod 0600 "${target_dir}/ca.key" "${target_dir}/server.key"
chmod 0644 "${target_dir}/ca.crt" "${target_dir}/server.crt"
openssl verify -CAfile "${target_dir}/ca.crt" "${target_dir}/server.crt"
openssl x509 -in "${target_dir}/server.crt" -noout -checkhost db
echo "created TLS material in ${target_dir}; keep ca.key host-only"
