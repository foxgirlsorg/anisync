import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSettings, setSettings } from "@/lib/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
import { handleApiError } from "@/lib/apiError";

const KEYS = Object.values(SETTINGS_KEYS);

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getSettings(KEYS);
    // Never echo secrets back to the client; report presence only.
    const redacted = Object.fromEntries(
      KEYS.map((k) => [
        k,
        k.endsWith("_secret") ? (settings[k] ? "" : null) : settings[k],
      ])
    );
    return NextResponse.json({
      settings: redacted,
      configured: {
        mal: Boolean(settings[SETTINGS_KEYS.MAL_CLIENT_ID] && settings[SETTINGS_KEYS.MAL_CLIENT_SECRET]),
        anilist: Boolean(settings[SETTINGS_KEYS.ANILIST_CLIENT_ID] && settings[SETTINGS_KEYS.ANILIST_CLIENT_SECRET]),
        shikimori: Boolean(settings[SETTINGS_KEYS.SHIKIMORI_CLIENT_ID] && settings[SETTINGS_KEYS.SHIKIMORI_CLIENT_SECRET]),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  mal_client_id: z.string().optional(),
  mal_client_secret: z.string().optional(),
  anilist_client_id: z.string().optional(),
  anilist_client_secret: z.string().optional(),
  shikimori_client_id: z.string().optional(),
  shikimori_client_secret: z.string().optional(),
  shikimori_app_name: z.string().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = schema.parse(await req.json());
    const values = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== "")) as Record<
      string,
      string
    >;
    if (Object.keys(values).length > 0) await setSettings(values);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return handleApiError(err);
  }
}
