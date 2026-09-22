import { prisma } from "@/lib/db";
import { SETTINGS_KEYS } from "@/lib/constants";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? null]));
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function setSettings(values: Record<string, string>) {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
    )
  );
}

export type ProviderCredentials = {
  clientId: string;
  clientSecret: string;
};

export async function getMalCredentials(): Promise<ProviderCredentials | null> {
  const s = await getSettings([SETTINGS_KEYS.MAL_CLIENT_ID, SETTINGS_KEYS.MAL_CLIENT_SECRET]);
  if (!s[SETTINGS_KEYS.MAL_CLIENT_ID] || !s[SETTINGS_KEYS.MAL_CLIENT_SECRET]) return null;
  return { clientId: s[SETTINGS_KEYS.MAL_CLIENT_ID]!, clientSecret: s[SETTINGS_KEYS.MAL_CLIENT_SECRET]! };
}

export async function getAnilistCredentials(): Promise<ProviderCredentials | null> {
  const s = await getSettings([SETTINGS_KEYS.ANILIST_CLIENT_ID, SETTINGS_KEYS.ANILIST_CLIENT_SECRET]);
  if (!s[SETTINGS_KEYS.ANILIST_CLIENT_ID] || !s[SETTINGS_KEYS.ANILIST_CLIENT_SECRET]) return null;
  return { clientId: s[SETTINGS_KEYS.ANILIST_CLIENT_ID]!, clientSecret: s[SETTINGS_KEYS.ANILIST_CLIENT_SECRET]! };
}

export async function getShikimoriCredentials(): Promise<(ProviderCredentials & { appName: string }) | null> {
  const s = await getSettings([
    SETTINGS_KEYS.SHIKIMORI_CLIENT_ID,
    SETTINGS_KEYS.SHIKIMORI_CLIENT_SECRET,
    SETTINGS_KEYS.SHIKIMORI_APP_NAME,
  ]);
  if (!s[SETTINGS_KEYS.SHIKIMORI_CLIENT_ID] || !s[SETTINGS_KEYS.SHIKIMORI_CLIENT_SECRET]) return null;
  return {
    clientId: s[SETTINGS_KEYS.SHIKIMORI_CLIENT_ID]!,
    clientSecret: s[SETTINGS_KEYS.SHIKIMORI_CLIENT_SECRET]!,
    appName: s[SETTINGS_KEYS.SHIKIMORI_APP_NAME] || "AniSync",
  };
}

export function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}
