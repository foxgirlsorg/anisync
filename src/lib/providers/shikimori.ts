import { GraphQLClient, gql } from "graphql-request";
import { appUrl } from "@/lib/settings";
import { universalToTenPointInt } from "@/lib/scoreConvert";
import { RatingRoundMode } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import type { CanonicalStatus, ExternalProfile, NormalizedEntry, OAuthCredentials } from "@/lib/providers/types";

const log = createLogger("shikimori");

// shikimori.one 301-redirects to shikimori.io; talk to .io directly.
const AUTH_URL = "https://shikimori.io/oauth/authorize";
const TOKEN_URL = "https://shikimori.io/oauth/token";
const GRAPHQL_URL = "https://shikimori.io/api/graphql";
const REST_BASE = "https://shikimori.io/api";

function redirectUri() {
  return `${appUrl()}/api/connections/SHIKIMORI/callback`;
}

export function buildAuthorizeUrl(clientId: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "user_rates",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Shikimori enforces 5 req/s AND 90 req/min — the per-minute cap is the
 * binding one (it works out to ~1.5 req/s average), and going over it gets
 * you a plain-text "Retry later" body instead of JSON, which would
 * otherwise surface as a confusing parse error deep in graphql-request. All
 * Shikimori HTTP calls (GraphQL and REST) go through this single global,
 * serialized, rate-limited+retrying fetch so a sync with a large list
 * doesn't silently fail partway through.
 */
const MIN_INTERVAL_MS = 700; // ~85 req/min, safely under the 90/min cap
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

async function throttledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const run = async (): Promise<Response> => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(input, init);
      if (res.status !== 429) return res;
      const backoffMs = 1000 * attempt;
      log.warn("rate limited, backing off", { url: String(input), attempt, backoffMs });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
    log.error("still rate limited after retries, giving up", { url: String(input) });
    return fetch(input, init);
  };
  const result = queue.then(run, run);
  // Keep the chain alive even if this call fails, so later calls still wait
  // their turn instead of firing all at once.
  queue = result.catch(() => undefined);
  return result;
}

async function tokenRequest(userAgent: string, body: Record<string, string>): Promise<OAuthCredentials> {
  const res = await throttledFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": userAgent },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Shikimori token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token: string; created_at: number; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date((json.created_at + json.expires_in) * 1000),
  };
}

export function exchangeCode(clientId: string, clientSecret: string, code: string, userAgent: string) {
  return tokenRequest(userAgent, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    code,
  });
}

export function refreshToken(clientId: string, clientSecret: string, refreshToken: string, userAgent: string) {
  return tokenRequest(userAgent, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

function graphqlClient(accessToken: string, userAgent: string) {
  return new GraphQLClient(GRAPHQL_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": userAgent },
    fetch: throttledFetch,
  });
}

async function restFetch(accessToken: string, userAgent: string, path: string, init?: RequestInit) {
  const res = await throttledFetch(`${REST_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": userAgent,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    log.error("REST call failed", { path, method: init?.method ?? "GET", status: res.status, body });
    throw new Error(`Shikimori API ${path} failed: ${res.status} ${body}`);
  }
  return res;
}

export async function getProfile(accessToken: string, userAgent: string): Promise<ExternalProfile> {
  const query = gql`
    query {
      currentUser {
        id
        nickname
      }
    }
  `;
  const data = await graphqlClient(accessToken, userAgent).request<{ currentUser: { id: string; nickname: string } }>(
    query
  );
  return { externalUserId: data.currentUser.id, externalUsername: data.currentUser.nickname };
}

const STATUS_TO_SHIKI: Record<CanonicalStatus, string> = {
  CURRENT: "watching",
  PLANNING: "planned",
  COMPLETED: "completed",
  DROPPED: "dropped",
  PAUSED: "on_hold",
  REPEATING: "rewatching",
};

const SHIKI_STATUS_TO_CANONICAL: Record<string, CanonicalStatus> = {
  watching: "CURRENT",
  planned: "PLANNING",
  completed: "COMPLETED",
  dropped: "DROPPED",
  on_hold: "PAUSED",
  rewatching: "REPEATING",
};

type ShikiUserRate = {
  id: string;
  score: number;
  status: string;
  episodes: number;
  chapters: number;
  volumes: number;
  rewatches: number;
  text: string | null;
  // malId comes back as a numeric string (GraphQL ID scalar), not an Int.
  anime: { id: string; malId: string | null; name: string } | null;
  manga: { id: string; malId: string | null; name: string } | null;
};

/**
 * Fetches the full rate list for one media kind in a single paginated
 * GraphQL round-trip, returning both the normalized entries AND a
 * malId -> Shikimori rate id map — callers that need both (the sync engine)
 * used to issue this query twice; doing it once roughly halves Shikimori
 * API calls per sync.
 */
async function fetchListWithRateIds(
  accessToken: string,
  userId: string,
  userAgent: string,
  targetType: "Anime" | "Manga"
): Promise<{ entries: NormalizedEntry[]; rateIds: Map<number, string> }> {
  const query = gql`
    query ($userId: ID!, $targetType: UserRateTargetTypeEnum, $page: PositiveInt) {
      userRates(userId: $userId, targetType: $targetType, page: $page, limit: 50) {
        id
        score
        status
        episodes
        chapters
        volumes
        rewatches
        text
        anime {
          id
          malId
          name
        }
        manga {
          id
          malId
          name
        }
      }
    }
  `;
  const c = graphqlClient(accessToken, userAgent);
  const entries: NormalizedEntry[] = [];
  const rateIds = new Map<number, string>();
  for (let page = 1; ; page++) {
    const data = await c.request<{ userRates: ShikiUserRate[] }>(query, { userId, targetType, page });
    if (data.userRates.length === 0) break;
    for (const r of data.userRates) {
      // `anime`/`manga` are independent id-based lookups, not guarded by the
      // rate's actual target type (both can be non-null for the same rate,
      // pointing at unrelated titles that share a numeric id) — only trust
      // the field matching the targetType we filtered this query by.
      const media = targetType === "Anime" ? r.anime : r.manga;
      if (!media?.malId) continue;
      const malId = Number(media.malId);
      rateIds.set(malId, r.id);
      entries.push({
        malId,
        mediaKind: targetType === "Anime" ? "ANIME" : "MANGA",
        title: media.name,
        status: SHIKI_STATUS_TO_CANONICAL[r.status] ?? "PLANNING",
        score: r.score ?? 0,
        progress: targetType === "Anime" ? r.episodes ?? 0 : r.chapters ?? 0,
        progressVolumes: targetType === "Manga" ? r.volumes ?? 0 : null,
        repeatCount: r.rewatches ?? 0,
        priority: 0, // Shikimori has no priority concept
        startDate: null,
        finishDate: null,
        notes: r.text || null,
        customLists: [],
      });
    }
    if (data.userRates.length < 50) break;
  }
  return { entries, rateIds };
}

export async function fetchAnimeList(accessToken: string, userId: string, userAgent: string) {
  return (await fetchListWithRateIds(accessToken, userId, userAgent, "Anime")).entries;
}

export async function fetchMangaList(accessToken: string, userId: string, userAgent: string) {
  return (await fetchListWithRateIds(accessToken, userId, userAgent, "Manga")).entries;
}

/** Used by the sync engine so it doesn't have to fetch the list twice to
 * get both the normalized entries and the rate ids needed for updates. */
export async function fetchAnimeListWithRateIds(accessToken: string, userId: string, userAgent: string) {
  return fetchListWithRateIds(accessToken, userId, userAgent, "Anime");
}

export async function fetchMangaListWithRateIds(accessToken: string, userId: string, userAgent: string) {
  return fetchListWithRateIds(accessToken, userId, userAgent, "Manga");
}

/**
 * Shikimori has no "find by MAL id" query — its own `id` historically
 * matches the MAL id for anime/manga that were imported from MAL (the
 * large majority), but can diverge for Shikimori-exclusive entries. We try
 * the direct id and verify it against the returned `malId` field rather
 * than trust the coincidence blindly; anything that doesn't check out is
 * reported as skipped instead of risking a wrong title.
 */
export async function resolveShikimoriId(
  accessToken: string,
  userAgent: string,
  malId: number,
  kind: "ANIME" | "MANGA"
): Promise<string | null> {
  const query =
    kind === "ANIME"
      ? gql`
          query ($ids: String) {
            animes(ids: $ids) {
              id
              malId
            }
          }
        `
      : gql`
          query ($ids: String) {
            mangas(ids: $ids) {
              id
              malId
            }
          }
        `;
  const data = await graphqlClient(accessToken, userAgent).request<{
    animes?: { id: string; malId: string | null }[];
    mangas?: { id: string; malId: string | null }[];
  }>(query, { ids: String(malId) });
  const match = (data.animes ?? data.mangas ?? []).find((m) => Number(m.malId) === malId);
  return match ? match.id : null;
}

export type ShikimoriWriteFields = Partial<{
  status: boolean;
  progress: boolean;
  score: boolean;
  ratingRoundMode: RatingRoundMode;
  notes: boolean;
  rewatches: boolean;
}>;

export async function createEntry(
  accessToken: string,
  userAgent: string,
  userId: string,
  targetId: string,
  entry: NormalizedEntry,
  fields: ShikimoriWriteFields
): Promise<string> {
  const payload = buildUserRatePayload(userId, targetId, entry, fields);
  const res = await restFetch(accessToken, userAgent, "/v2/user_rates", {
    method: "POST",
    body: JSON.stringify({ user_rate: payload }),
  });
  const json = (await res.json()) as { id: number };
  return String(json.id);
}

export async function updateEntry(
  accessToken: string,
  userAgent: string,
  rateId: string,
  entry: NormalizedEntry,
  fields: ShikimoriWriteFields
): Promise<void> {
  const payload = buildUserRatePayload(null, null, entry, fields);
  await restFetch(accessToken, userAgent, `/v2/user_rates/${rateId}`, {
    method: "PATCH",
    body: JSON.stringify({ user_rate: payload }),
  });
}

export async function deleteEntry(accessToken: string, userAgent: string, rateId: string): Promise<void> {
  await restFetch(accessToken, userAgent, `/v2/user_rates/${rateId}`, { method: "DELETE" });
}

function buildUserRatePayload(
  userId: string | null,
  targetId: string | null,
  entry: NormalizedEntry,
  fields: ShikimoriWriteFields
) {
  const payload: Record<string, unknown> = {};
  if (userId) payload.user_id = Number(userId);
  if (targetId) {
    payload.target_id = Number(targetId);
    payload.target_type = entry.mediaKind === "ANIME" ? "Anime" : "Manga";
  }
  if (fields.status) payload.status = STATUS_TO_SHIKI[entry.status];
  if (fields.progress) {
    if (entry.mediaKind === "ANIME") payload.episodes = entry.progress;
    else {
      payload.chapters = entry.progress;
      if (entry.progressVolumes != null) payload.volumes = entry.progressVolumes;
    }
  }
  if (fields.score) payload.score = universalToTenPointInt(entry.score, fields.ratingRoundMode ?? "NEAREST");
  if (fields.notes && entry.notes) payload.text = entry.notes;
  if (fields.rewatches) payload.rewatches = entry.repeatCount;
  return payload;
}
