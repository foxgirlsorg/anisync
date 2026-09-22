#!/bin/sh
set -e

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
