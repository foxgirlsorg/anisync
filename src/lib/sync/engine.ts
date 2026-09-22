import { prisma } from "@/lib/db";
import { ServiceId, RatingRoundMode } from "@/lib/constants";
import { getFreshAccessToken } from "@/lib/providers/connection";
import { getShikimoriCredentials } from "@/lib/settings";
import type { NormalizedEntry, SkippedEntry } from "@/lib/providers/types";
import * as mal from "@/lib/providers/mal";
import * as anilist from "@/lib/providers/anilist";
import * as shikimori from "@/lib/providers/shikimori";
import type { SyncDestinationConfig, ServiceConnection } from "@/generated/prisma";

type DestinationResult = { created: number; updated: number; skipped: number; skippedEntries: SkippedEntry[] };

async function fetchSourceEntries(service: ServiceId, conn: ServiceConnection): Promise<NormalizedEntry[]> {
  const token = await getFreshAccessToken(conn.userId, service);
  if (service === "MAL") {
    const [anime, manga] = await Promise.all([mal.fetchAnimeList(token), mal.fetchMangaList(token)]);
    return [...anime, ...manga];
  }
  if (service === "ANILIST") {
    const userId = Number(conn.externalUserId);
    const [anime, manga] = await Promise.all([anilist.fetchAnimeList(token, userId), anilist.fetchMangaList(token, userId)]);
    return [...anime, ...manga];
  }
  const creds = await getShikimoriCredentials();
  if (!creds) throw new Error("Shikimori credentials are not configured");
  const [anime, manga] = await Promise.all([
    shikimori.fetchAnimeList(token, conn.externalUserId!, creds.appName),
    shikimori.fetchMangaList(token, conn.externalUserId!, creds.appName),
  ]);
  return [...anime, ...manga];
}

function filterForDestination(entries: NormalizedEntry[], dest: SyncDestinationConfig): NormalizedEntry[] {
  return entries.filter((e) => (e.mediaKind === "ANIME" ? dest.importAnime : dest.importManga));
}

async function applyToMal(entries: NormalizedEntry[], conn: ServiceConnection, dest: SyncDestinationConfig): Promise<DestinationResult> {
  const token = await getFreshAccessToken(conn.userId, "MAL");
  const [existingAnime, existingManga] = await Promise.all([mal.fetchAnimeList(token), mal.fetchMangaList(token)]);
  const existingIds = new Set([...existingAnime, ...existingManga].map((e) => `${e.mediaKind}:${e.malId}`));

  const result: DestinationResult = { created: 0, updated: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    comments: dest.importComments,
    startDate: dest.importStartDate,
    finishDate: dest.importFinishDate,
    rewatches: dest.importRewatches,
    priority: dest.importPriority,
    customLists: dest.importCustomLists,
  };
  for (const entry of entries) {
    try {
      const existed = existingIds.has(`${entry.mediaKind}:${entry.malId}`);
      await mal.upsertEntry(token, entry, writeFields);
      if (existed) result.updated++;
      else result.created++;
    } catch (err) {
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: (err as Error).message });
    }
  }

  if (dest.destructive) {
    const sourceIds = new Set(entries.map((e) => `${e.mediaKind}:${e.malId}`));
    for (const existing of [...existingAnime, ...existingManga]) {
      const key = `${existing.mediaKind}:${existing.malId}`;
      if (sourceIds.has(key)) continue;
      const kindEnabled = existing.mediaKind === "ANIME" ? dest.importAnime : dest.importManga;
      if (!kindEnabled) continue;
      try {
        await mal.deleteEntry(token, existing.mediaKind, existing.malId);
      } catch {
        // best-effort; leaving a stale entry is safer than crashing the whole run
      }
    }
  }

  return result;
}

async function applyToAnilist(
  entries: NormalizedEntry[],
  conn: ServiceConnection,
  dest: SyncDestinationConfig
): Promise<DestinationResult> {
  const token = await getFreshAccessToken(conn.userId, "ANILIST");
  const userId = Number(conn.externalUserId);
  // Recorded on the connection when it was linked (see getProfile in the
  // connect callback); needed because AniList's `score` mutation argument is
  // interpreted in the destination account's own display format.
  const destScoreFormat = (conn.scoreFormat as anilist.AnilistScoreFormat | null) ?? "POINT_10";

  const animeEntries = entries.filter((e) => e.mediaKind === "ANIME");
  const mangaEntries = entries.filter((e) => e.mediaKind === "MANGA");

  const [existingAnimeIds, existingMangaIds] = await Promise.all([
    dest.importAnime ? anilist.fetchEntryIds(token, userId, "ANIME") : Promise.resolve(new Map<number, number>()),
    dest.importManga ? anilist.fetchEntryIds(token, userId, "MANGA") : Promise.resolve(new Map<number, number>()),
  ]);
  const [animeMediaIds, mangaMediaIds] = await Promise.all([
    dest.importAnime ? anilist.resolveMediaIds(token, animeEntries.map((e) => e.malId), "ANIME") : Promise.resolve(new Map<number, number>()),
    dest.importManga ? anilist.resolveMediaIds(token, mangaEntries.map((e) => e.malId), "MANGA") : Promise.resolve(new Map<number, number>()),
  ]);

  const result: DestinationResult = { created: 0, updated: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    comments: dest.importComments,
    startDate: dest.importStartDate,
    finishDate: dest.importFinishDate,
    rewatches: dest.importRewatches,
    priority: dest.importPriority,
    customLists: dest.importCustomLists,
  };

  for (const entry of entries) {
    const mediaIds = entry.mediaKind === "ANIME" ? animeMediaIds : mangaMediaIds;
    const existingIds = entry.mediaKind === "ANIME" ? existingAnimeIds : existingMangaIds;
    const mediaId = mediaIds.get(entry.malId);
    if (!mediaId) {
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: "Not found on AniList" });
      continue;
    }
    try {
      await anilist.upsertEntry(token, mediaId, entry, destScoreFormat, writeFields);
      if (existingIds.has(entry.malId)) result.updated++;
      else result.created++;
    } catch (err) {
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: (err as Error).message });
    }
  }

  if (dest.destructive) {
    const sourceAnimeIds = new Set(animeEntries.map((e) => e.malId));
    const sourceMangaIds = new Set(mangaEntries.map((e) => e.malId));
    for (const [malId, entryId] of existingAnimeIds) {
      if (!sourceAnimeIds.has(malId)) {
        try {
          await anilist.deleteEntryByMediaId(token, entryId);
        } catch {
          // best-effort
        }
      }
    }
    for (const [malId, entryId] of existingMangaIds) {
      if (!sourceMangaIds.has(malId)) {
        try {
          await anilist.deleteEntryByMediaId(token, entryId);
        } catch {
          // best-effort
        }
      }
    }
  }

  return result;
}

async function applyToShikimori(
  entries: NormalizedEntry[],
  conn: ServiceConnection,
  dest: SyncDestinationConfig
): Promise<DestinationResult> {
  const creds = await getShikimoriCredentials();
  if (!creds) throw new Error("Shikimori credentials are not configured");
  const token = await getFreshAccessToken(conn.userId, "SHIKIMORI");
  const [existingAnime, existingManga] = await Promise.all([
    dest.importAnime ? shikimori.fetchAnimeList(token, conn.externalUserId!, creds.appName) : Promise.resolve([]),
    dest.importManga ? shikimori.fetchMangaList(token, conn.externalUserId!, creds.appName) : Promise.resolve([]),
  ]);
  const existingByKind = {
    ANIME: new Map(existingAnime.map((e) => [e.malId, e])),
    MANGA: new Map(existingManga.map((e) => [e.malId, e])),
  };
  // We need Shikimori's own rate id to update/delete an existing entry, but
  // NormalizedEntry doesn't carry it — re-fetch minimally via a side map.
  // (fetchAnimeList/fetchMangaList already did the GraphQL round-trip above;
  // this keeps the rate id alongside without changing the shared type.)
  const rateIdByKind = await fetchRateIds(token, creds.appName, conn.externalUserId!, dest);

  const result: DestinationResult = { created: 0, updated: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    comments: dest.importComments,
    rewatches: dest.importRewatches,
  };

  for (const entry of entries) {
    const existingMap = existingByKind[entry.mediaKind];
    const rateIdMap = rateIdByKind[entry.mediaKind];
    try {
      if (existingMap.has(entry.malId)) {
        await shikimori.updateEntry(token, creds.appName, rateIdMap.get(entry.malId)!, entry, writeFields);
        result.updated++;
      } else {
        const targetId = await shikimori.resolveShikimoriId(token, creds.appName, entry.malId, entry.mediaKind);
        if (!targetId) {
          result.skipped++;
          result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: "Not found on Shikimori" });
          continue;
        }
        await shikimori.createEntry(token, creds.appName, conn.externalUserId!, targetId, entry, writeFields);
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: (err as Error).message });
    }
  }

  if (dest.destructive) {
    const sourceIds = { ANIME: new Set(entries.filter((e) => e.mediaKind === "ANIME").map((e) => e.malId)), MANGA: new Set(entries.filter((e) => e.mediaKind === "MANGA").map((e) => e.malId)) };
    for (const kind of ["ANIME", "MANGA"] as const) {
      for (const [malId] of existingByKind[kind]) {
        if (sourceIds[kind].has(malId)) continue;
        const rateId = rateIdByKind[kind].get(malId);
        if (!rateId) continue;
        try {
          await shikimori.deleteEntry(token, creds.appName, rateId);
        } catch {
          // best-effort
        }
      }
    }
  }

  return result;
}

/** GraphQL reads don't expose the rate id per malId directly in a convenient
 * shape for updates, so pull id+malId pairs separately, scoped to what this
 * destination actually imports. */
async function fetchRateIds(
  token: string,
  userAgent: string,
  externalUserId: string,
  dest: SyncDestinationConfig
): Promise<{ ANIME: Map<number, string>; MANGA: Map<number, string> }> {
  const { GraphQLClient, gql } = await import("graphql-request");
  const client = new GraphQLClient("https://shikimori.io/api/graphql", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
  });
  const query = gql`
    query ($userId: ID!, $targetType: UserRateTargetTypeEnum, $page: PositiveInt) {
      userRates(userId: $userId, targetType: $targetType, page: $page, limit: 50) {
        id
        anime {
          malId
        }
        manga {
          malId
        }
      }
    }
  `;
  const out = { ANIME: new Map<number, string>(), MANGA: new Map<number, string>() };
  for (const [kind, targetType, enabled] of [
    ["ANIME", "Anime", dest.importAnime],
    ["MANGA", "Manga", dest.importManga],
  ] as const) {
    if (!enabled) continue;
    for (let page = 1; ; page++) {
      const data: { userRates: { id: string; anime: { malId: string | null } | null; manga: { malId: string | null } | null }[] } =
        await client.request(query, { userId: externalUserId, targetType, page });
      if (data.userRates.length === 0) break;
      for (const r of data.userRates) {
        const malId = kind === "ANIME" ? r.anime?.malId : r.manga?.malId;
        if (malId) out[kind].set(Number(malId), r.id);
      }
      if (data.userRates.length < 50) break;
    }
  }
  return out;
}

export async function runSync(userId: string, trigger: "manual" | "scheduled") {
  const config = await prisma.syncConfig.findUnique({ where: { userId }, include: { destinations: true } });
  if (!config?.sourceService) throw new Error("No source configured");

  const connections = await prisma.serviceConnection.findMany({ where: { userId } });
  const connByService = new Map(connections.map((c) => [c.service as ServiceId, c]));
  const sourceConn = connByService.get(config.sourceService as ServiceId);
  if (!sourceConn) throw new Error("Source account is not connected");

  const run = await prisma.syncRun.create({ data: { userId, trigger } });
  try {
    const sourceEntries = await fetchSourceEntries(config.sourceService as ServiceId, sourceConn);

    for (const dest of config.destinations) {
      if (!dest.enabled || dest.service === config.sourceService) continue;
      const destConn = connByService.get(dest.service as ServiceId);
      if (!destConn) continue;

      const filtered = filterForDestination(sourceEntries, dest);
      let outcome: DestinationResult;
      if (dest.service === "MAL") outcome = await applyToMal(filtered, destConn, dest);
      else if (dest.service === "ANILIST") outcome = await applyToAnilist(filtered, destConn, dest);
      else outcome = await applyToShikimori(filtered, destConn, dest);

      await prisma.syncRunResult.create({
        data: {
          syncRunId: run.id,
          destinationService: dest.service,
          created: outcome.created,
          updated: outcome.updated,
          skipped: outcome.skipped,
          skippedEntries: JSON.stringify(outcome.skippedEntries),
        },
      });
    }

    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "success", finishedAt: new Date() } });
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), errorMessage: (err as Error).message },
    });
    throw err;
  }
  return run.id;
}
