# AniSync

[![License: MIT](https://img.shields.io/static/v1.svg?label=License&message=MIT&color=de6161&colorA=252525)](LICENSE)
[![Theme: DevDark](https://img.shields.io/static/v1.svg?label=Theme&message=DevDark&color=de6161&colorA=252525)](https://github.com/devdarktheme/.github)

> **Keeps your MyAnimeList, AniList and Shikimori anime/manga lists in sync.**

AniSync uses each service's MyAnimeList id as the universal key — AniList and
Shikimori both expose it directly on every list entry — so a title is matched
across all three services without any separate ID-mapping lookup table.

## 🛠️ Technical overview

- **Framework:** [Next.js](https://nextjs.org/) (App Router) + TypeScript, App
  Router routes doubling as the API
- **Database:** [Prisma](https://www.prisma.io/) — SQLite by default, MariaDB
  as a drop-in alternative, selected by `DB_PROVIDER` from one shared schema
- **Auth:** email + password (bcrypt), session as a signed JWT in an httpOnly
  cookie — no third-party auth provider
- **Provider clients:** AniList and Shikimori over GraphQL
  (`graphql-request`), MAL over its REST v2 API + OAuth2 PKCE
- **Scheduler:** a standalone `node-cron` worker process, separate from the
  web container
- **UI:** [DevDark](https://github.com/devdarktheme/.github) — a near-black
  base with a single warm red accent (`#161616` / `#de6161`) — laid out
  mobile-first
- **Containerization:** Docker + Docker Compose

## ✨ Features

- Register/log in; connect any combination of **MAL**, **AniList** and
  **Shikimori** via OAuth
- Pick one connected account as the sync **source** — every other connected
  account becomes a **destination**, and any of them can be switched to be
  the source instead
- Per-destination sync settings:
  - **Destructive import** — also remove destination titles that aren't in
    the source list
  - **Ratings**, converted to a universal 0–10 scale with a configurable
    rounding mode (nearest / up / down) for the conversion
  - Comments, custom lists/tags, status changes, episode/chapter progress,
    start/finish dates, rewatch count, priority
  - Anime and manga toggled independently
- Manual **"run sync now"**, plus an optional automatic sync once every 24h
- Sync history with per-destination created/updated/skipped counts, and the
  list of skipped titles (e.g. not found on that destination) with the reason
- **Admin** tab: user count and connections per service — the first account
  registered becomes admin automatically

## 🚀 Running it

All provider API credentials (MAL / AniList / Shikimori client id + secret)
are configured from the web UI — **Admin → Integrations** — after the first
user registers. Nothing provider-specific goes in `.env`.

### Docker (recommended)

```bash
cp .env.example .env
# edit .env: set JWT_SECRET and APP_URL at minimum
docker compose up -d --build
```

This starts the web app (port `3000`) and a background worker that checks
hourly for accounts due their 24h auto-sync, both backed by SQLite stored in
`./db` next to this repo (a bind mount, not a named volume — named volumes
are keyed by the Compose project name, which defaults to the directory name,
so cloning or moving the repo to a differently-named path silently gets you
a fresh empty volume; a fixed host path avoids that). Open
`http://localhost:3000`, register the first (admin) account, then go to
**Admin → Integrations** to add OAuth app credentials for whichever services
you want to support — each one's redirect URI is shown in that form.

To use MariaDB instead of SQLite:

```bash
# in .env: DB_PROVIDER=mysql
#          DATABASE_URL=mysql://anisync:<MARIADB_PASSWORD>@db:3306/anisync
docker compose --profile mariadb up -d --build
```

### Local development (no Docker)

```bash
npm install
cp .env.example .env   # DATABASE_URL=file:./dev.db works as-is
npm run dev            # applies migrations + generates the Prisma client first
```

In a second terminal, run the scheduler worker if you want to exercise
auto-sync locally:

```bash
npm run worker
```

## ⚙️ Environment variables

| Variable | Default | Description |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | `sqlite` or `mysql` (MariaDB-compatible) |
| `DATABASE_URL` | `file:./dev.db` | Connection string matching `DB_PROVIDER` — see `.env.example` for the Docker/sqlite/MariaDB variants |
| `JWT_SECRET` | — | Long random string signing session cookies; generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `APP_URL` | `http://localhost:3000` | Public origin used to build OAuth redirect URIs |
| `MARIADB_PASSWORD` / `MARIADB_ROOT_PASSWORD` | — | Only used by the `db` service under `docker compose --profile mariadb` |

## 📂 Project layout

| Path | Purpose |
|---|---|
| `src/lib/providers/{mal,anilist,shikimori}.ts` | One file per service: OAuth + list read/write, each mapped to/from a shared `NormalizedEntry` shape keyed by MAL id |
| `src/lib/sync/engine.ts` | Orchestrates a sync run across all enabled destinations |
| `src/worker/cron.ts` | The standalone scheduler process |
| `prisma/schema.template.prisma` | Single source of schema truth, rendered into `prisma/schema.prisma` for either provider by `scripts/select-db.js` (SQLite has no native enum type, which is why status/service fields are plain validated strings instead of Prisma enums) |

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE)
file for details.
