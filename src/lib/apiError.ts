import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api");

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  log.error("unhandled API error", { error: (err as Error).message, stack: (err as Error).stack });
  return NextResponse.json({ error: (err as Error).message || "Internal error" }, { status: 500 });
}
