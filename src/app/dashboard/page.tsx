import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string; service?: string; message?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [connections, config] = await Promise.all([
    prisma.serviceConnection.findMany({ where: { userId: user.id } }),
    prisma.syncConfig.findUnique({ where: { userId: user.id } }),
  ]);
  const params = await searchParams;

  return (
    <DashboardClient
      email={user.email}
      connections={connections.map((c) => ({ service: c.service, externalUsername: c.externalUsername }))}
      sourceService={config?.sourceService ?? null}
      autoSyncEnabled={config?.autoSyncEnabled ?? false}
      callbackNotice={
        params.connection ? { status: params.connection as "connected" | "error", service: params.service, message: params.message } : null
      }
    />
  );
}
