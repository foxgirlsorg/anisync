import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_LABELS, ServiceId } from "@/lib/constants";
import IntegrationsForm from "@/components/IntegrationsForm";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  const [userCount, connectionCounts, autoSyncCount] = await Promise.all([
    prisma.user.count(),
    prisma.serviceConnection.groupBy({ by: ["service"], _count: { _all: true } }),
    prisma.syncConfig.count({ where: { autoSyncEnabled: true } }),
  ]);
  const countsByService = Object.fromEntries(connectionCounts.map((c) => [c.service, c._count._all]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Admin</h1>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Users" value={userCount} />
        <Stat label="Auto-sync on" value={autoSyncCount} />
        {(["MAL", "ANILIST", "SHIKIMORI"] as ServiceId[]).map((s) => (
          <Stat key={s} label={`${SERVICE_LABELS[s]} links`} value={countsByService[s] ?? 0} />
        ))}
      </section>

      <IntegrationsForm />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}
