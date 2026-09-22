import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runSync } from "@/lib/sync/engine";
import { handleApiError } from "@/lib/apiError";

export async function POST() {
  try {
    const user = await requireUser();
    const runId = await runSync(user.id, "manual");
    return NextResponse.json({ runId });
  } catch (err) {
    return handleApiError(err);
  }
}
