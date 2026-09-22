import { prisma } from "@/lib/db";
import { ServiceId, RatingRoundMode } from "@/lib/constants";
import { getFreshAccessToken } from "@/lib/providers/connection";
import { getShikimoriCredentials } from "@/lib/settings";
import { createLogger } from "@/lib/logger";
import { universalToTenPointInt, universalToAnilistScore } from "@/lib/scoreConvert";
import type { NormalizedEntry, SkippedEntry } from "@/lib/providers/types";
import * as mal from "@/lib/providers/mal";
import * as anilist from "@/lib/providers/anilist";
import * as shikimori from "@/lib/providers/shikimori";
import type { SyncDestinationConfig, ServiceConnection } from "@/generated/prisma";

const log = createLogger("sync");

type DestinationResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  skippedEntries: SkippedEntry[];
};

/** Fields shared by all three destinations' write-field option objects that
 * don't need provider-specific conversion to compare (score is handled
 * separately by the caller, since MAL/Shikimori's native scale and
 * AniList's account-specific scoreFormat need different target values). */
type DiffFields = Partial<{
  status: boolean;
  progress: boolean;
  notes: boolean;
  rewatches: boolean;
  priority: boolean;
  startDate: boolean;
  finishDate: boolean;
  customLists: boolean;
}>;

/**
 * Which fields differ between `desired` (from the source list) and
 * `existing` (the destination's current entry) among the ones this
 * destination is configured to sync — an empty array means the entry is
 * already up to date and the write call can be skipped entirely.
 *
 * `notes` and `customLists` are deliberately NOT compared here: they're
 * lossy, non-corresponding text/tags across services (MAL tags vs AniList
 * custom lists vs Shikimori's plain text field don't match syntactically
 * even when conceptually "the same"), so comparing them would report a
 * difference on nearly every entry, every run, defeating the point of
 * diffing at all. They still get included in the actual write whenever a
 * write happens for another reason — they just don't gate it on their own.
 */
function diffFields(desired: NormalizedEntry, existing: NormalizedEntry, fields: DiffFields): string[] {
  const diffs: string[] = [];
  if (fields.status && desired.status !== existing.status) diffs.push("status");
  if (fields.progress) {
    if (desired.progress !== existing.progress) diffs.push("progress");
    if (desired.mediaKind === "MANGA" && (desired.progressVolumes ?? 0) !== (existing.progressVolumes ?? 0)) {
      diffs.push("progressVolumes");
    }
  }
  if (fields.rewatches && desired.repeatCount !== existing.repeatCount) diffs.push("rewatches");
  if (fields.priority && desired.priority !== existing.priority) diffs.push("priority");
  if (fields.startDate && desired.startDate !== existing.startDate) diffs.push("startDate");
  if (fields.finishDate && desired.finishDate !== existing.finishDate) diffs.push("finishDate");
  return diffs;
}

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
  const existingByKey = new Map([...existingAnime, ...existingManga].map((e) => [`${e.mediaKind}:${e.malId}`, e]));

  const result: DestinationResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    notes: dest.importNotes,
    startDate: dest.importStartDate,
    finishDate: dest.importFinishDate,
    rewatches: dest.importRewatches,
    priority: dest.importPriority,
    customLists: dest.importCustomLists,
  };
  for (const entry of entries) {
    const existing = existingByKey.get(`${entry.mediaKind}:${entry.malId}`);
    let diffs: string[] = [];
    if (existing) {
      const scoreTarget = writeFields.score ? universalToTenPointInt(entry.score, writeFields.ratingRoundMode) : null;
      if (scoreTarget != null && scoreTarget !== Math.round(existing.score)) diffs.push("score");
      diffs = diffs.concat(diffFields(entry, existing, writeFields));
      if (diffs.length === 0) {
        result.unchanged++;
        continue;
      }
    }
    try {
      log.info(existing ? "updating entry" : "creating entry", {
        destination: "MAL",
        malId: entry.malId,
        title: entry.title,
        diffs: existing ? diffs : undefined,
      });
      await mal.upsertEntry(token, entry, writeFields);
      if (existing) result.updated++;
      else result.created++;
    } catch (err) {
      log.error("write failed", { destination: "MAL", malId: entry.malId, title: entry.title, error: (err as Error).message });
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

  const [animeResult, mangaResult] = await Promise.all([
    dest.importAnime
      ? anilist.fetchAnimeListWithEntryIds(token, userId)
      : Promise.resolve({ entries: [] as NormalizedEntry[], entryIds: new Map<number, number>() }),
    dest.importManga
      ? anilist.fetchMangaListWithEntryIds(token, userId)
      : Promise.resolve({ entries: [] as NormalizedEntry[], entryIds: new Map<number, number>() }),
  ]);
  const existingByKind = {
    ANIME: new Map(animeResult.entries.map((e) => [e.malId, e])),
    MANGA: new Map(mangaResult.entries.map((e) => [e.malId, e])),
  };
  const entryIdsByKind = { ANIME: animeResult.entryIds, MANGA: mangaResult.entryIds };

  const [animeMediaIds, mangaMediaIds] = await Promise.all([
    dest.importAnime ? anilist.resolveMediaIds(token, animeEntries.map((e) => e.malId), "ANIME") : Promise.resolve(new Map<number, number>()),
    dest.importManga ? anilist.resolveMediaIds(token, mangaEntries.map((e) => e.malId), "MANGA") : Promise.resolve(new Map<number, number>()),
  ]);

  const result: DestinationResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    notes: dest.importNotes,
    startDate: dest.importStartDate,
    finishDate: dest.importFinishDate,
    rewatches: dest.importRewatches,
    priority: dest.importPriority,
    customLists: dest.importCustomLists,
  };

  for (const entry of entries) {
    const mediaIds = entry.mediaKind === "ANIME" ? animeMediaIds : mangaMediaIds;
    const existing = existingByKind[entry.mediaKind].get(entry.malId);
    const mediaId = mediaIds.get(entry.malId);
    if (!mediaId) {
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: "Not found on AniList" });
      continue;
    }
    let diffs: string[] = [];
    if (existing) {
      const scoreTarget = writeFields.score
        ? universalToAnilistScore(entry.score, destScoreFormat, writeFields.ratingRoundMode)
        : null;
      const currentScore = writeFields.score ? universalToAnilistScore(existing.score, destScoreFormat, "NEAREST") : null;
      if (scoreTarget != null && Math.abs(scoreTarget - currentScore!) > 0.05) diffs.push("score");
      diffs = diffs.concat(diffFields(entry, existing, writeFields));
      if (diffs.length === 0) {
        result.unchanged++;
        continue;
      }
    }
    try {
      log.info(existing ? "updating entry" : "creating entry", {
        destination: "ANILIST",
        malId: entry.malId,
        title: entry.title,
        diffs: existing ? diffs : undefined,
      });
      await anilist.upsertEntry(token, mediaId, entry, destScoreFormat, writeFields);
      if (existing) result.updated++;
      else result.created++;
    } catch (err) {
      log.error("write failed", { destination: "ANILIST", malId: entry.malId, title: entry.title, error: (err as Error).message });
      result.skipped++;
      result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: (err as Error).message });
    }
  }

  if (dest.destructive) {
    const sourceAnimeIds = new Set(animeEntries.map((e) => e.malId));
    const sourceMangaIds = new Set(mangaEntries.map((e) => e.malId));
    for (const [malId, entryId] of entryIdsByKind.ANIME) {
      if (!sourceAnimeIds.has(malId)) {
        try {
          await anilist.deleteEntryByMediaId(token, entryId);
        } catch {
          // best-effort
        }
      }
    }
    for (const [malId, entryId] of entryIdsByKind.MANGA) {
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
  // One paginated GraphQL fetch per media kind gives us both the normalized
  // entries AND the rate id we need for updates/deletes — fetching it twice
  // (as an earlier version of this did) doubled Shikimori API calls per
  // sync, which its 90-req/min rate limit does not have room for.
  const [animeResult, mangaResult] = await Promise.all([
    dest.importAnime
      ? shikimori.fetchAnimeListWithRateIds(token, conn.externalUserId!, creds.appName)
      : Promise.resolve({ entries: [], rateIds: new Map<number, string>() }),
    dest.importManga
      ? shikimori.fetchMangaListWithRateIds(token, conn.externalUserId!, creds.appName)
      : Promise.resolve({ entries: [], rateIds: new Map<number, string>() }),
  ]);
  const existingByKind = {
    ANIME: new Map(animeResult.entries.map((e) => [e.malId, e])),
    MANGA: new Map(mangaResult.entries.map((e) => [e.malId, e])),
  };
  const rateIdByKind = { ANIME: animeResult.rateIds, MANGA: mangaResult.rateIds };

  const result: DestinationResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, skippedEntries: [] };
  const writeFields = {
    status: dest.importStatus,
    progress: dest.importProgress,
    score: dest.importRatings,
    ratingRoundMode: dest.ratingRoundMode as RatingRoundMode,
    notes: dest.importNotes,
    rewatches: dest.importRewatches,
  };

  for (const entry of entries) {
    const existingMap = existingByKind[entry.mediaKind];
    const rateIdMap = rateIdByKind[entry.mediaKind];
    const existing = existingMap.get(entry.malId);
    let diffs: string[] = [];
    if (existing) {
      const scoreTarget = writeFields.score ? universalToTenPointInt(entry.score, writeFields.ratingRoundMode) : null;
      if (scoreTarget != null && scoreTarget !== Math.round(existing.score)) diffs.push("score");
      diffs = diffs.concat(diffFields(entry, existing, writeFields));
      if (diffs.length === 0) {
        result.unchanged++;
        continue;
      }
    }
    try {
      if (existing) {
        log.info("updating entry", { destination: "SHIKIMORI", malId: entry.malId, title: entry.title, diffs });
        await shikimori.updateEntry(token, creds.appName, rateIdMap.get(entry.malId)!, entry, writeFields);
        result.updated++;
      } else {
        const targetId = await shikimori.resolveShikimoriId(token, creds.appName, entry.malId, entry.mediaKind);
        if (!targetId) {
          result.skipped++;
          result.skippedEntries.push({ malId: entry.malId, title: entry.title, reason: "Not found on Shikimori" });
          continue;
        }
        log.info("creating entry", { destination: "SHIKIMORI", malId: entry.malId, title: entry.title });
        await shikimori.createEntry(token, creds.appName, conn.externalUserId!, targetId, entry, writeFields);
        result.created++;
      }
    } catch (err) {
      log.error("write failed", { destination: "SHIKIMORI", malId: entry.malId, title: entry.title, error: (err as Error).message });
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

export async function runSync(userId: string, trigger: "manual" | "scheduled") {
  const config = await prisma.syncConfig.findUnique({ where: { userId }, include: { destinations: true } });
  if (!config?.sourceService) throw new Error("No source configured");

  const connections = await prisma.serviceConnection.findMany({ where: { userId } });
  const connByService = new Map(connections.map((c) => [c.service as ServiceId, c]));
  const sourceConn = connByService.get(config.sourceService as ServiceId);
  if (!sourceConn) throw new Error("Source account is not connected");

  const run = await prisma.syncRun.create({ data: { userId, trigger } });
  log.info("run started", { runId: run.id, userId, trigger, source: config.sourceService });
  try {
    const sourceEntries = await fetchSourceEntries(config.sourceService as ServiceId, sourceConn);
    log.info("fetched source list", { runId: run.id, source: config.sourceService, entries: sourceEntries.length });

    for (const dest of config.destinations) {
      if (!dest.enabled || dest.service === config.sourceService) continue;
      const destConn = connByService.get(dest.service as ServiceId);
      if (!destConn) {
        log.warn("destination enabled but not connected, skipping", { runId: run.id, destination: dest.service });
        continue;
      }

      const filtered = filterForDestination(sourceEntries, dest);
      let outcome: DestinationResult;
      try {
        if (dest.service === "MAL") outcome = await applyToMal(filtered, destConn, dest);
        else if (dest.service === "ANILIST") outcome = await applyToAnilist(filtered, destConn, dest);
        else outcome = await applyToShikimori(filtered, destConn, dest);
      } catch (err) {
        // One destination failing outright (bad token, provider outage)
        // shouldn't take the whole run down with it — record it as fully
        // skipped and keep going with the remaining destinations.
        log.error("destination failed", { runId: run.id, destination: dest.service, error: (err as Error).message });
        outcome = {
          created: 0,
          updated: 0,
          unchanged: 0,
          skipped: filtered.length,
          skippedEntries: filtered.map((e) => ({ malId: e.malId, title: e.title, reason: (err as Error).message })),
        };
      }

      log.info("destination finished", {
        runId: run.id,
        destination: dest.service,
        created: outcome.created,
        updated: outcome.updated,
        unchanged: outcome.unchanged,
        skipped: outcome.skipped,
      });

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
    log.info("run finished", { runId: run.id, status: "success" });
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), errorMessage: (err as Error).message },
    });
    log.error("run failed", { runId: run.id, error: (err as Error).message });
    throw err;
  }
  return run.id;
}
