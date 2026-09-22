import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: (err as Error).message || "Internal error" }, { status: 500 });
}
