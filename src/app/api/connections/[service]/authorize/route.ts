import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { SERVICES, ServiceId } from "@/lib/constants";
import { createOAuthState, randomCodeVerifier } from "@/lib/oauthState";
import { getMalCredentials, getAnilistCredentials, getShikimoriCredentials } from "@/lib/settings";
import * as mal from "@/lib/providers/mal";
import * as anilist from "@/lib/providers/anilist";
import * as shikimori from "@/lib/providers/shikimori";
import { handleApiError } from "@/lib/apiError";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  try {
    const user = await requireUser();
    const { service } = await params;
    if (!SERVICES.includes(service as ServiceId)) {
      return NextResponse.json({ error: "Unknown service" }, { status: 400 });
    }

    if (service === "MAL") {
      const creds = await getMalCredentials();
      if (!creds) return NextResponse.json({ error: "MAL is not configured yet. Ask an admin to add API keys." }, { status: 400 });
      const codeVerifier = randomCodeVerifier();
      const state = await createOAuthState({ userId: user.id, service: "MAL", codeVerifier });
      return NextResponse.redirect(mal.buildAuthorizeUrl(creds.clientId, state, codeVerifier));
    }

    if (service === "ANILIST") {
      const creds = await getAnilistCredentials();
      if (!creds) return NextResponse.json({ error: "AniList is not configured yet. Ask an admin to add API keys." }, { status: 400 });
      const state = await createOAuthState({ userId: user.id, service: "ANILIST" });
      return NextResponse.redirect(anilist.buildAuthorizeUrl(creds.clientId, state));
    }

    const creds = await getShikimoriCredentials();
    if (!creds) return NextResponse.json({ error: "Shikimori is not configured yet. Ask an admin to add API keys." }, { status: 400 });
    const state = await createOAuthState({ userId: user.id, service: "SHIKIMORI" });
    return NextResponse.redirect(shikimori.buildAuthorizeUrl(creds.clientId, state));
  } catch (err) {
    return handleApiError(err);
  }
}
