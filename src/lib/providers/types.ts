import { MediaKind } from "@/lib/constants";

/** Canonical list status, matching AniList's MediaListStatus enum exactly
 * (chosen as the universal set because it's the only one of the three that
 * already distinguishes REPEATING from CURRENT/COMPLETED). */
export type CanonicalStatus = "CURRENT" | "PLANNING" | "COMPLETED" | "DROPPED" | "PAUSED" | "REPEATING";

export type NormalizedEntry = {
  malId: number;
  mediaKind: MediaKind;
  title: string;
  status: CanonicalStatus;
  /** 0-10 universal scale, 0 = unrated */
  score: number;
  progress: number; // episodes / chapters
  progressVolumes: number | null; // manga volumes only
  repeatCount: number;
  priority: number; // 0 low, 1 normal, 2 high
  startDate: string | null; // YYYY-MM-DD
  finishDate: string | null; // YYYY-MM-DD
  notes: string | null;
  customLists: string[];
};

export type OAuthCredentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export type ExternalProfile = {
  externalUserId: string;
  externalUsername: string;
  /** AniList only: needed to convert universal scores into the account's display format. */
  scoreFormat?: string;
};

export type ApplyResult = "created" | "updated" | "skipped";

export type SkippedEntry = { malId: number; title: string; reason: string };
