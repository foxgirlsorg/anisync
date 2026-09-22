import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SERVICES, ServiceId } from "@/lib/constants";
import { verifyOAuthState } from "@/lib/oauthState";
import { getMalCredentials, getAnilistCredentials, getShikimoriCredentials, appUrl } from "@/lib/settings";
import * as mal from "@/lib/providers/mal";
import * as anilist from "@/lib/providers/anilist";
import * as shikimori from "@/lib/providers/shikimori";

function redirectToDashboard(status: "connected" | "error", service: string, message?: string) {
  const url = new URL("/dashboard", appUrl());
  url.searchParams.set("connection", status);
  url.searchParams.set("service", service);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get("error");
  if (error) return redirectToDashboard("error", service, error);

  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken || !SERVICES.includes(service as ServiceId)) {
    return redirectToDashboard("error", service, "Missing authorization code");
  }

  try {
    const state = await verifyOAuthState(stateToken);
    if (state.service !== service) throw new Error("State/service mismatch");

    if (service === "MAL") {
      const creds = await getMalCredentials();
      if (!creds || !state.codeVerifier) throw new Error("MAL is not configured");
      const tokens = await mal.exchangeCode(creds.clientId, creds.clientSecret, code, state.codeVerifier);
      const profile = await mal.getProfile(tokens.accessToken);
      await saveConnection(state.userId, "MAL", tokens, profile);
    } else if (service === "ANILIST") {
      const creds = await getAnilistCredentials();
      if (!creds) throw new Error("AniList is not configured");
      const tokens = await anilist.exchangeCode(creds.clientId, creds.clientSecret, code);
      const profile = await anilist.getProfile(tokens.accessToken);
      await saveConnection(state.userId, "ANILIST", tokens, profile);
    } else {
      const creds = await getShikimoriCredentials();
      if (!creds) throw new Error("Shikimori is not configured");
      const tokens = await shikimori.exchangeCode(creds.clientId, creds.clientSecret, code, creds.appName);
      const profile = await shikimori.getProfile(tokens.accessToken, creds.appName);
      await saveConnection(state.userId, "SHIKIMORI", tokens, profile);
    }

    return redirectToDashboard("connected", service);
  } catch (err) {
    return redirectToDashboard("error", service, (err as Error).message);
  }
}

async function saveConnection(
  userId: string,
  service: ServiceId,
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  profile: { externalUserId: string; externalUsername: string; scoreFormat?: string }
) {
  await prisma.serviceConnection.upsert({
    where: { userId_service: { userId, service } },
    create: {
      userId,
      service,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      externalUserId: profile.externalUserId,
      externalUsername: profile.externalUsername,
      scoreFormat: profile.scoreFormat ?? null,
    },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      externalUserId: profile.externalUserId,
      externalUsername: profile.externalUsername,
      scoreFormat: profile.scoreFormat ?? null,
    },
  });
  const config = await prisma.syncConfig.upsert({ where: { userId }, create: { userId }, update: {} });
  await prisma.syncDestinationConfig.upsert({
    where: { syncConfigId_service: { syncConfigId: config.id, service } },
    create: { service, syncConfigId: config.id },
    update: {},
  });
}
