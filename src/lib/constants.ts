export const SERVICES = ["MAL", "ANILIST", "SHIKIMORI"] as const;
export type ServiceId = (typeof SERVICES)[number];

export const RATING_ROUND_MODES = ["NEAREST", "UP", "DOWN"] as const;
export type RatingRoundMode = (typeof RATING_ROUND_MODES)[number];

export const MEDIA_KINDS = ["ANIME", "MANGA"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const SERVICE_LABELS: Record<ServiceId, string> = {
  MAL: "MyAnimeList",
  ANILIST: "AniList",
  SHIKIMORI: "Shikimori",
};

export const SETTINGS_KEYS = {
  MAL_CLIENT_ID: "mal_client_id",
  MAL_CLIENT_SECRET: "mal_client_secret",
  ANILIST_CLIENT_ID: "anilist_client_id",
  ANILIST_CLIENT_SECRET: "anilist_client_secret",
  SHIKIMORI_CLIENT_ID: "shikimori_client_id",
  SHIKIMORI_CLIENT_SECRET: "shikimori_client_secret",
  SHIKIMORI_APP_NAME: "shikimori_app_name",
} as const;

export const SESSION_COOKIE = "anisync_session";
