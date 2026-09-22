import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/apiError";

export async function GET() {
  try {
    const user = await requireUser();
    const connections = await prisma.serviceConnection.findMany({ where: { userId: user.id } });
    return NextResponse.json({
      connections: connections.map((c) => ({
        service: c.service,
        externalUsername: c.externalUsername,
        connectedAt: c.createdAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
