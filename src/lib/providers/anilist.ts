import { GraphQLClient, gql } from "graphql-request";
import { appUrl } from "@/lib/settings";
import { anilistScoreToUniversal, universalToAnilistScore, type AnilistScoreFormat } from "@/lib/scoreConvert";

export type { AnilistScoreFormat };
import { RatingRoundMode } from "@/lib/constants";
import type { CanonicalStatus, ExternalProfile, NormalizedEntry, OAuthCredentials } from "@/lib/providers/types";

const AUTH_URL = "https://anilist.co/api/v2/oauth/authorize";
const TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
const GRAPHQL_URL = "https://graphql.anilist.co";

function redirectUri() {
  return `${appUrl()}/api/connections/ANILIST/callback`;
}

export function buildAuthorizeUrl(clientId: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AniList token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

export function exchangeCode(clientId: string, clientSecret: string, code: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    code,
  });
}

// AniList access tokens are long-lived (~1 year) and it does not issue
// refresh tokens for the authorization-code flow, so there is no
// refreshToken() here — re-authorization is only needed if the user revokes
// access or the token expires.

function client(accessToken: string) {
  return new GraphQLClient(GRAPHQL_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function getProfile(accessToken: string): Promise<ExternalProfile> {
  const query = gql`
    query {
      Viewer {
        id
        name
        mediaListOptions {
          scoreFormat
        }
      }
    }
  `;
  const data = await client(accessToken).request<{
    Viewer: { id: number; name: string; mediaListOptions: { scoreFormat: AnilistScoreFormat } };
  }>(query);
  return {
    externalUserId: String(data.Viewer.id),
    externalUsername: data.Viewer.name,
    scoreFormat: data.Viewer.mediaListOptions.scoreFormat,
  };
}

function fuzzyDateToIso(d: { year: number | null; month: number | null; day: number | null } | null): string | null {
  if (!d || !d.year) return null;
  const mm = String(d.month ?? 1).padStart(2, "0");
  const dd = String(d.day ?? 1).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

function isoToFuzzyDate(iso: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return null;
  return { year: y, month: m || 1, day: d || 1 };
}

type AnilistListEntry = {
  status: CanonicalStatus;
  score: number;
  progress: number;
  progressVolumes: number | null;
  repeat: number;
  priority: number;
  notes: string | null;
  startedAt: { year: number | null; month: number | null; day: number | null } | null;
  completedAt: { year: number | null; month: number | null; day: number | null } | null;
  customLists: Record<string, boolean> | null;
  media: { idMal: number | null; title: { romaji: string } };
};

async function fetchList(accessToken: string, userId: number, type: "ANIME" | "MANGA"): Promise<NormalizedEntry[]> {
  const query = gql`
    query ($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists {
          entries {
            status
            score(format: POINT_100)
            progress
            progressVolumes
            repeat
            priority
            notes
            startedAt {
              year
              month
              day
            }
            completedAt {
              year
              month
              day
            }
            customLists(asArray: false)
            media {
              idMal
              title {
                romaji
              }
            }
          }
        }
      }
    }
  `;
  const data = await client(accessToken).request<{ MediaListCollection: { lists: { entries: AnilistListEntry[] }[] } }>(
    query,
    { userId, type }
  );
  const entries: NormalizedEntry[] = [];
  for (const list of data.MediaListCollection.lists) {
    for (const e of list.entries) {
      if (!e.media.idMal) continue; // not on MAL, can't map to the universal id
      entries.push({
        malId: e.media.idMal,
        mediaKind: type === "ANIME" ? "ANIME" : "MANGA",
        title: e.media.title.romaji,
        status: e.status,
        // requested with format: POINT_100 explicitly, so this is always out of 100
        score: anilistScoreToUniversal(e.score, "POINT_100"),
        progress: e.progress ?? 0,
        progressVolumes: type === "MANGA" ? e.progressVolumes ?? 0 : null,
        repeatCount: e.repeat ?? 0,
        priority: e.priority ?? 0,
        startDate: fuzzyDateToIso(e.startedAt),
        finishDate: fuzzyDateToIso(e.completedAt),
        notes: e.notes || null,
        customLists: Object.entries(e.customLists ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k),
      });
    }
  }
  return entries;
}

export async function fetchAnimeList(accessToken: string, userId: number) {
  return fetchList(accessToken, userId, "ANIME");
}

export async function fetchMangaList(accessToken: string, userId: number) {
  return fetchList(accessToken, userId, "MANGA");
}

/** Bulk-resolves MAL ids to AniList internal media ids. */
export async function resolveMediaIds(
  accessToken: string,
  malIds: number[],
  type: "ANIME" | "MANGA"
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const query = gql`
    query ($ids: [Int], $type: MediaType) {
      Page(perPage: 50) {
        media(idMal_in: $ids, type: $type) {
          id
          idMal
        }
      }
    }
  `;
  const c = client(accessToken);
  for (let i = 0; i < malIds.length; i += 50) {
    const chunk = malIds.slice(i, i + 50);
    const data = await c.request<{ Page: { media: { id: number; idMal: number }[] } }>(query, { ids: chunk, type });
    for (const m of data.Page.media) map.set(m.idMal, m.id);
  }
  return map;
}

export type AnilistWriteFields = Partial<{
  status: boolean;
  progress: boolean;
  score: boolean;
  ratingRoundMode: RatingRoundMode;
  notes: boolean;
  startDate: boolean;
  finishDate: boolean;
  rewatches: boolean;
  priority: boolean;
  customLists: boolean;
}>;

export async function upsertEntry(
  accessToken: string,
  mediaId: number,
  entry: NormalizedEntry,
  destinationScoreFormat: AnilistScoreFormat,
  fields: AnilistWriteFields
): Promise<void> {
  const mutation = gql`
    mutation (
      $mediaId: Int
      $status: MediaListStatus
      $score: Float
      $progress: Int
      $progressVolumes: Int
      $repeat: Int
      $priority: Int
      $notes: String
      $startedAt: FuzzyDateInput
      $completedAt: FuzzyDateInput
      $customLists: [String]
    ) {
      SaveMediaListEntry(
        mediaId: $mediaId
        status: $status
        score: $score
        progress: $progress
        progressVolumes: $progressVolumes
        repeat: $repeat
        priority: $priority
        notes: $notes
        startedAt: $startedAt
        completedAt: $completedAt
        customLists: $customLists
      ) {
        id
      }
    }
  `;
  const variables: Record<string, unknown> = { mediaId };
  if (fields.status) variables.status = entry.status;
  if (fields.progress) {
    variables.progress = entry.progress;
    if (entry.mediaKind === "MANGA") variables.progressVolumes = entry.progressVolumes ?? undefined;
  }
  if (fields.score) {
    variables.score = universalToAnilistScore(entry.score, destinationScoreFormat, fields.ratingRoundMode ?? "NEAREST");
  }
  if (fields.notes) variables.notes = entry.notes ?? undefined;
  if (fields.startDate) variables.startedAt = isoToFuzzyDate(entry.startDate);
  if (fields.finishDate) variables.completedAt = isoToFuzzyDate(entry.finishDate);
  if (fields.rewatches) variables.repeat = entry.repeatCount;
  if (fields.priority) variables.priority = entry.priority;
  if (fields.customLists && entry.customLists.length) variables.customLists = entry.customLists;

  await client(accessToken).request(mutation, variables);
}

export async function deleteEntryByMediaId(accessToken: string, entryId: number): Promise<void> {
  const mutation = gql`
    mutation ($id: Int) {
      DeleteMediaListEntry(id: $id) {
        deleted
      }
    }
  `;
  await client(accessToken).request(mutation, { id: entryId });
}

/** AniList list entries are addressed by their own `id`, not by media id —
 * fetch a userId+mediaId -> entryId map for deletions in destructive mode. */
export async function fetchEntryIds(
  accessToken: string,
  userId: number,
  type: "ANIME" | "MANGA"
): Promise<Map<number, number>> {
  const query = gql`
    query ($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists {
          entries {
            id
            media {
              idMal
            }
          }
        }
      }
    }
  `;
  const data = await client(accessToken).request<{
    MediaListCollection: { lists: { entries: { id: number; media: { idMal: number | null } }[] }[] };
  }>(query, { userId, type });
  const map = new Map<number, number>();
  for (const list of data.MediaListCollection.lists) {
    for (const e of list.entries) {
      if (e.media.idMal) map.set(e.media.idMal, e.id);
    }
  }
  return map;
}
