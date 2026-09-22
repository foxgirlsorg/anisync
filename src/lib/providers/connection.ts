import { prisma } from "@/lib/db";
import { ServiceId } from "@/lib/constants";
import { getMalCredentials, getShikimoriCredentials } from "@/lib/settings";
import * as mal from "@/lib/providers/mal";
import * as shikimori from "@/lib/providers/shikimori";

/**
 * Returns a valid (non-expired) access token for the connection, refreshing
 * and persisting it first if needed. AniList tokens don't expire within any
 * realistic sync window and issue no refresh token, so they're returned as-is.
 */
export async function getFreshAccessToken(userId: string, service: ServiceId): Promise<string> {
  const conn = await prisma.serviceConnection.findUniqueOrThrow({ where: { userId_service: { userId, service } } });

  const expiringSoon = conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiringSoon || !conn.refreshToken) return conn.accessToken;

  if (service === "MAL") {
    const creds = await getMalCredentials();
    if (!creds) throw new Error("MAL credentials are not configured");
    const tokens = await mal.refreshToken(creds.clientId, creds.clientSecret, conn.refreshToken);
    await prisma.serviceConnection.update({
      where: { id: conn.id },
      data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.expiresAt },
    });
    return tokens.accessToken;
  }

  if (service === "SHIKIMORI") {
    const creds = await getShikimoriCredentials();
    if (!creds) throw new Error("Shikimori credentials are not configured");
    const tokens = await shikimori.refreshToken(creds.clientId, creds.clientSecret, conn.refreshToken, creds.appName);
    await prisma.serviceConnection.update({
      where: { id: conn.id },
      data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.expiresAt },
    });
    return tokens.accessToken;
  }

  return conn.accessToken;
}
