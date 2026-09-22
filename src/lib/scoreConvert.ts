import { RatingRoundMode } from "@/lib/constants";

/**
 * Universal rating scale is 0-10 (float), matching MAL/Shikimori's native
 * scale. AniList scores are converted to/from this scale based on the
 * account's own scoreFormat (POINT_100 / POINT_10_DECIMAL / POINT_10 /
 * POINT_5 / POINT_3), which AniList exposes per-user via
 * `User.mediaListOptions.scoreFormat`.
 */
export type AnilistScoreFormat = "POINT_100" | "POINT_10_DECIMAL" | "POINT_10" | "POINT_5" | "POINT_3";

export function anilistScoreToUniversal(score: number, format: AnilistScoreFormat): number {
  if (!score) return 0;
  switch (format) {
    case "POINT_100":
      return score / 10;
    case "POINT_10_DECIMAL":
    case "POINT_10":
      return score;
    case "POINT_5":
      return score * 2;
    case "POINT_3":
      // smiley scale: 1 = bad, 2 = neutral, 3 = good
      return score >= 3 ? 9 : score === 2 ? 5.5 : 2;
    default:
      return score;
  }
}

function roundValue(value: number, mode: RatingRoundMode): number {
  switch (mode) {
    case "UP":
      return Math.ceil(value);
    case "DOWN":
      return Math.floor(value);
    case "NEAREST":
    default:
      return Math.round(value);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Universal 0-10 -> plain 0-10 integer score, used by both MAL and Shikimori. */
export function universalToTenPointInt(universal: number, mode: RatingRoundMode): number {
  if (!universal) return 0;
  return clamp(roundValue(universal, mode), 1, 10);
}

/**
 * Universal 0-10 -> the destination AniList account's own scoreFormat. The
 * `score` field on SaveMediaListEntry is interpreted according to the
 * target account's scoreFormat, so unlike MAL/Shikimori this conversion
 * needs the destination's format, not just the source's.
 */
export function universalToAnilistScore(universal: number, format: AnilistScoreFormat, mode: RatingRoundMode): number {
  if (!universal) return 0;
  switch (format) {
    case "POINT_100":
      return clamp(roundValue(universal * 10, mode), 0, 100);
    case "POINT_10_DECIMAL":
      return clamp(Math.round(universal * 10) / 10, 0, 10);
    case "POINT_10":
      return clamp(roundValue(universal, mode), 0, 10);
    case "POINT_5":
      return clamp(roundValue(universal / 2, mode), 0, 5);
    case "POINT_3":
      if (universal >= 7) return 3;
      if (universal >= 4) return 2;
      return universal > 0 ? 1 : 0;
    default:
      return clamp(roundValue(universal, mode), 0, 10);
  }
}
