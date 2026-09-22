import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/apiError";

export async function GET() {
  try {
    const user = await requireUser();
    const runs = await prisma.syncRun.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { results: true },
    });
    return NextResponse.json({
      runs: runs.map((r) => ({
        ...r,
        results: r.results.map((res) => ({ ...res, skippedEntries: res.skippedEntries ? JSON.parse(res.skippedEntries) : [] })),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
