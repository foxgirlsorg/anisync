import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/apiError";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }

    const isFirstUser = (await prisma.user.count()) === 0;
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        isAdmin: isFirstUser,
      },
    });
    await prisma.syncConfig.create({ data: { userId: user.id } });

    await setSessionCookie(user.id);
    return NextResponse.json({ id: user.id, email: user.email, isAdmin: user.isAdmin });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    return handleApiError(err);
  }
}
