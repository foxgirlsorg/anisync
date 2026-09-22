import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICES } from "@/lib/constants";
import SyncConfigForm from "@/components/SyncConfigForm";

export default async function SyncSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [connections, config] = await Promise.all([
    prisma.serviceConnection.findMany({ where: { userId: user.id } }),
    prisma.syncConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      include: { destinations: true },
    }),
  ]);

  const connectedServices = new Set(connections.map((c) => c.service));
  const destinationsByService = new Map(config.destinations.map((d) => [d.service, d]));

  const destinations = SERVICES.filter((s) => connectedServices.has(s)).map((service) => {
    const existing = destinationsByService.get(service);
    return {
      service,
      enabled: existing?.enabled ?? true,
      destructive: existing?.destructive ?? false,
      importAnime: existing?.importAnime ?? true,
      importManga: existing?.importManga ?? true,
      importStatus: existing?.importStatus ?? true,
      importProgress: existing?.importProgress ?? true,
      importRatings: existing?.importRatings ?? true,
      ratingRoundMode: (existing?.ratingRoundMode as "NEAREST" | "UP" | "DOWN") ?? "NEAREST",
      importNotes: existing?.importNotes ?? false,
      importCustomLists: existing?.importCustomLists ?? false,
      importStartDate: existing?.importStartDate ?? true,
      importFinishDate: existing?.importFinishDate ?? true,
      importRewatches: existing?.importRewatches ?? true,
      importPriority: existing?.importPriority ?? false,
    };
  });

  return (
    <SyncConfigForm
      connectedServices={[...connectedServices]}
      sourceService={config.sourceService}
      autoSyncEnabled={config.autoSyncEnabled}
      destinations={destinations}
    />
  );
}
