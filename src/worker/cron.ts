import cron from "node-cron";
import { prisma } from "@/lib/db";
import { runSync } from "@/lib/sync/engine";

const CHECK_INTERVAL_CRON = "0 * * * *"; // hourly
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function tick() {
  const configs = await prisma.syncConfig.findMany({
    where: { autoSyncEnabled: true, sourceService: { not: null } },
  });

  for (const config of configs) {
    const lastRun = await prisma.syncRun.findFirst({
      where: { userId: config.userId, trigger: "scheduled" },
      orderBy: { startedAt: "desc" },
    });
    const dueSince = lastRun ? Date.now() - lastRun.startedAt.getTime() : Infinity;
    if (dueSince < AUTO_SYNC_INTERVAL_MS) continue;

    console.log(`[cron] running scheduled sync for user ${config.userId}`);
    try {
      await runSync(config.userId, "scheduled");
    } catch (err) {
      console.error(`[cron] scheduled sync failed for user ${config.userId}:`, err);
    }
  }
}

console.log(`[cron] worker started, checking every hour for accounts due a 24h sync`);
cron.schedule(CHECK_INTERVAL_CRON, () => {
  tick().catch((err) => console.error("[cron] tick failed:", err));
});

// Also run once at startup so a fresh deploy doesn't wait up to an hour.
tick().catch((err) => console.error("[cron] initial tick failed:", err));
