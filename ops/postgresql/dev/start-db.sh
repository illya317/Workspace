#!/usr/bin/env bash
set -euo pipefail

install -d -o postgres -g postgres -m 0700 /var/lib/postgresql/tls
install -o postgres -g postgres -m 0644 /run/secrets/postgres_ca /var/lib/postgresql/tls/ca.crt
install -o postgres -g postgres -m 0644 /run/secrets/postgres_server_cert /var/lib/postgresql/tls/server.crt
install -o postgres -g postgres -m 0600 /run/secrets/postgres_server_key /var/lib/postgresql/tls/server.key

openssl verify -CAfile /var/lib/postgresql/tls/ca.crt /var/lib/postgresql/tls/server.crt
openssl x509 -in /var/lib/postgresql/tls/server.crt -noout -checkhost db

exec /usr/local/bin/docker-entrypoint.sh "$@"
