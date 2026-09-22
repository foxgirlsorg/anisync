#!/bin/sh
set -e

# docker-compose.yml bind-mounts the host's ./db directory to
# /app/prisma/data — that's the ONLY path in this container that survives a
# rebuild/recreate. If DATABASE_URL (from .env) doesn't point in there for
# the sqlite provider, every rebuild silently starts from an empty database
# even though the compose file itself is correct. Auto-correct it rather
# than silently losing data to a stale .env value.
if [ "${DB_PROVIDER:-sqlite}" = "sqlite" ]; then
  case "$DATABASE_URL" in
    file:./data/*) ;;
    *)
      echo "WARNING: DATABASE_URL='$DATABASE_URL' does not point inside the persisted /app/prisma/data volume." >&2
      echo "WARNING: overriding to file:./data/anisync.db for this run so data survives rebuilds." >&2
      echo "WARNING: update DATABASE_URL in .env to file:./data/anisync.db to silence this." >&2
      export DATABASE_URL="file:./data/anisync.db"
      ;;
  esac
fi

# Renders prisma/schema.prisma + swaps in the right migration history for
# DB_PROVIDER (sqlite|mysql, default sqlite), regenerates the Prisma client
# to match, then applies migrations. `prisma generate` re-runs on every
# container start, but the query-engine binaries for both providers were
# already downloaded during the image build, so this is offline-safe and
# only takes a second or two.
node scripts/select-db.js
npx prisma generate
npx prisma migrate deploy

if [ "$1" = "worker" ]; then
  echo "Starting AniSync scheduler worker..."
  exec npm run worker
else
  echo "Starting AniSync web server..."
  exec npm run start
fi
