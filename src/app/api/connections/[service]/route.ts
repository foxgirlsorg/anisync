import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICES, ServiceId } from "@/lib/constants";
import { handleApiError } from "@/lib/apiError";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  try {
    const user = await requireUser();
    const { service } = await params;
    if (!SERVICES.includes(service as ServiceId)) {
      return NextResponse.json({ error: "Unknown service" }, { status: 400 });
    }
    await prisma.serviceConnection.deleteMany({ where: { userId: user.id, service } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
