import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/apiError";

export async function GET() {
  try {
    await requireAdmin();
    const [userCount, connectionCounts, autoSyncCount] = await Promise.all([
      prisma.user.count(),
      prisma.serviceConnection.groupBy({ by: ["service"], _count: { _all: true } }),
      prisma.syncConfig.count({ where: { autoSyncEnabled: true } }),
    ]);
    return NextResponse.json({
      userCount,
      autoSyncCount,
      connectionCounts: Object.fromEntries(connectionCounts.map((c) => [c.service, c._count._all])),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
