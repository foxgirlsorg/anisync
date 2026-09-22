import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICES, RATING_ROUND_MODES } from "@/lib/constants";
import { handleApiError } from "@/lib/apiError";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await prisma.syncConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      include: { destinations: true },
    });
    return NextResponse.json({ config });
  } catch (err) {
    return handleApiError(err);
  }
}

const destinationSchema = z.object({
  service: z.enum(SERVICES),
  enabled: z.boolean(),
  destructive: z.boolean(),
  importAnime: z.boolean(),
  importManga: z.boolean(),
  importStatus: z.boolean(),
  importProgress: z.boolean(),
  importRatings: z.boolean(),
  ratingRoundMode: z.enum(RATING_ROUND_MODES),
  importNotes: z.boolean(),
  importCustomLists: z.boolean(),
  importStartDate: z.boolean(),
  importFinishDate: z.boolean(),
  importRewatches: z.boolean(),
  importPriority: z.boolean(),
});

const schema = z.object({
  sourceService: z.enum(SERVICES).nullable(),
  autoSyncEnabled: z.boolean(),
  destinations: z.array(destinationSchema),
});

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    if (body.sourceService && body.destinations.some((d) => d.service === body.sourceService && d.enabled)) {
      return NextResponse.json({ error: "The source account can't also be an enabled destination" }, { status: 400 });
    }

    const config = await prisma.syncConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, sourceService: body.sourceService, autoSyncEnabled: body.autoSyncEnabled },
      update: { sourceService: body.sourceService, autoSyncEnabled: body.autoSyncEnabled },
    });

    await prisma.$transaction(
      body.destinations.map((d) =>
        prisma.syncDestinationConfig.upsert({
          where: { syncConfigId_service: { syncConfigId: config.id, service: d.service } },
          create: { ...d, syncConfigId: config.id },
          update: d,
        })
      )
    );

    const full = await prisma.syncConfig.findUnique({ where: { id: config.id }, include: { destinations: true } });
    return NextResponse.json({ config: full });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return handleApiError(err);
  }
}
