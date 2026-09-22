import { appUrl } from "@/lib/settings";
import { universalToTenPointInt } from "@/lib/scoreConvert";
import { RatingRoundMode } from "@/lib/constants";
import type { CanonicalStatus, ExternalProfile, NormalizedEntry, OAuthCredentials } from "@/lib/providers/types";

const AUTH_URL = "https://myanimelist.net/v1/oauth2/authorize";
const TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const API_BASE = "https://api.myanimelist.net/v2";

function redirectUri() {
  return `${appUrl()}/api/connections/MAL/callback`;
}

export function buildAuthorizeUrl(clientId: string, state: string, codeVerifier: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    // MAL only supports the "plain" PKCE method, where challenge === verifier
    code_challenge: codeVerifier,
    code_challenge_method: "plain",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`MAL token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  } satisfies OAuthCredentials;
}

export function exchangeCode(clientId: string, clientSecret: string, code: string, codeVerifier: string) {
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(),
  });
}

export function refreshToken(clientId: string, clientSecret: string, refreshToken: string) {
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function apiFetch(accessToken: string, pathOrUrl: string, init?: RequestInit) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`MAL API ${pathOrUrl} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function getProfile(accessToken: string): Promise<ExternalProfile> {
  const res = await apiFetch(accessToken, "/users/@me?fields=id,name");
  const json = (await res.json()) as { id: number; name: string };
  return { externalUserId: String(json.id), externalUsername: json.name };
}

const STATUS_TO_MAL: Record<CanonicalStatus, { status: string; rewatching: boolean }> = {
  CURRENT: { status: "watching", rewatching: false },
  PLANNING: { status: "plan_to_watch", rewatching: false },
  COMPLETED: { status: "completed", rewatching: false },
  DROPPED: { status: "dropped", rewatching: false },
  PAUSED: { status: "on_hold", rewatching: false },
  REPEATING: { status: "watching", rewatching: true },
};

const MAL_ANIME_STATUS_TO_CANONICAL: Record<string, CanonicalStatus> = {
  watching: "CURRENT",
  completed: "COMPLETED",
  on_hold: "PAUSED",
  dropped: "DROPPED",
  plan_to_watch: "PLANNING",
};

const MAL_MANGA_STATUS_TO_CANONICAL: Record<string, CanonicalStatus> = {
  reading: "CURRENT",
  completed: "COMPLETED",
  on_hold: "PAUSED",
  dropped: "DROPPED",
  plan_to_read: "PLANNING",
};

type MalListStatus = {
  status: string;
  score: number;
  num_episodes_watched?: number;
  num_chapters_read?: number;
  num_volumes_read?: number;
  is_rewatching?: boolean;
  is_rereading?: boolean;
  num_times_rewatched?: number;
  num_times_reread?: number;
  priority: number;
  comments: string;
  start_date?: string;
  finish_date?: string;
  tags: string[];
};

type MalListNode = {
  node: { id: number; title: string };
  list_status: MalListStatus;
};

async function fetchList(accessToken: string, kind: "anime" | "manga"): Promise<NormalizedEntry[]> {
  const fields =
    kind === "anime"
      ? "list_status{status,score,num_episodes_watched,is_rewatching,num_times_rewatched,priority,comments,start_date,finish_date,tags}"
      : "list_status{status,score,num_chapters_read,num_volumes_read,is_rereading,num_times_reread,priority,comments,start_date,finish_date,tags}";
  const entries: NormalizedEntry[] = [];
  let url: string | null = `/users/@me/${kind}list?fields=${encodeURIComponent(fields)}&limit=1000&nsfw=true`;
  while (url) {
    const res = await apiFetch(accessToken, url);
    const json = (await res.json()) as { data: MalListNode[]; paging: { next?: string } };
    for (const item of json.data) {
      const ls = item.list_status;
      const rewatching = kind === "anime" ? !!ls.is_rewatching : !!ls.is_rereading;
      const canonical = rewatching
        ? "REPEATING"
        : (kind === "anime" ? MAL_ANIME_STATUS_TO_CANONICAL : MAL_MANGA_STATUS_TO_CANONICAL)[ls.status] ?? "PLANNING";
      entries.push({
        malId: item.node.id,
        mediaKind: kind === "anime" ? "ANIME" : "MANGA",
        title: item.node.title,
        status: canonical,
        score: ls.score ?? 0,
        progress: (kind === "anime" ? ls.num_episodes_watched : ls.num_chapters_read) ?? 0,
        progressVolumes: kind === "manga" ? ls.num_volumes_read ?? 0 : null,
        repeatCount: (kind === "anime" ? ls.num_times_rewatched : ls.num_times_reread) ?? 0,
        priority: ls.priority ?? 0,
        startDate: ls.start_date ?? null,
        finishDate: ls.finish_date ?? null,
        comments: ls.comments || null,
        customLists: ls.tags ?? [],
      });
    }
    url = json.paging.next ?? null;
  }
  return entries;
}

export function fetchAnimeList(accessToken: string) {
  return fetchList(accessToken, "anime");
}

export function fetchMangaList(accessToken: string) {
  return fetchList(accessToken, "manga");
}

export type MalWriteFields = Partial<{
  status: boolean;
  progress: boolean;
  score: boolean;
  ratingRoundMode: RatingRoundMode;
  comments: boolean;
  startDate: boolean;
  finishDate: boolean;
  rewatches: boolean;
  priority: boolean;
  customLists: boolean;
}>;

export async function upsertEntry(
  accessToken: string,
  entry: NormalizedEntry,
  fields: MalWriteFields
): Promise<void> {
  const kind = entry.mediaKind === "ANIME" ? "anime" : "manga";
  const body = new URLSearchParams();
  if (fields.status) {
    const mapped = STATUS_TO_MAL[entry.status];
    body.set("status", mapped.status);
    body.set(kind === "anime" ? "is_rewatching" : "is_rereading", String(mapped.rewatching));
  }
  if (fields.progress) {
    body.set(kind === "anime" ? "num_watched_episodes" : "num_chapters_read", String(entry.progress));
    if (kind === "manga" && entry.progressVolumes != null) {
      body.set("num_volumes_read", String(entry.progressVolumes));
    }
  }
  if (fields.score) {
    body.set("score", String(universalToTenPointInt(entry.score, fields.ratingRoundMode ?? "NEAREST")));
  }
  if (fields.comments && entry.comments) body.set("comments", entry.comments);
  if (fields.startDate && entry.startDate) body.set("start_date", entry.startDate);
  if (fields.finishDate && entry.finishDate) body.set("finish_date", entry.finishDate);
  if (fields.rewatches) {
    body.set(kind === "anime" ? "num_times_rewatched" : "num_times_reread", String(entry.repeatCount));
  }
  if (fields.priority) body.set("priority", String(entry.priority));
  if (fields.customLists && entry.customLists.length) body.set("tags", entry.customLists.join(","));

  await apiFetch(accessToken, `/${kind}/${entry.malId}/my_list_status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function deleteEntry(accessToken: string, mediaKind: "ANIME" | "MANGA", malId: number): Promise<void> {
  const kind = mediaKind === "ANIME" ? "anime" : "manga";
  await apiFetch(accessToken, `/${kind}/${malId}/my_list_status`, { method: "DELETE" });
}
