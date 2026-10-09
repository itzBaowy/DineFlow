#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .local/backups
backup=".local/backups/dineflow-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
temporary="$backup.tmp"
trap 'rm -f -- "$temporary"' EXIT
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' > "$temporary"
test -s "$temporary"
mv -- "$temporary" "$backup"
printf 'PostgreSQL backup: %s\n' "$backup"
