import cron from "node-cron";
import { prisma } from "@/lib/db";
import { runSync } from "@/lib/sync/engine";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron");

const CHECK_INTERVAL_CRON = "0 * * * *"; // hourly
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function tick() {
  const configs = await prisma.syncConfig.findMany({
    where: { autoSyncEnabled: true, sourceService: { not: null } },
  });
  log.info("tick", { autoSyncAccounts: configs.length });

  for (const config of configs) {
    const lastRun = await prisma.syncRun.findFirst({
      where: { userId: config.userId, trigger: "scheduled" },
      orderBy: { startedAt: "desc" },
    });
    const dueSince = lastRun ? Date.now() - lastRun.startedAt.getTime() : Infinity;
    if (dueSince < AUTO_SYNC_INTERVAL_MS) continue;

    log.info("running scheduled sync", { userId: config.userId });
    try {
      await runSync(config.userId, "scheduled");
    } catch (err) {
      log.error("scheduled sync failed", { userId: config.userId, error: (err as Error).message });
    }
  }
}

log.info("worker started, checking every hour for accounts due a 24h sync");
cron.schedule(CHECK_INTERVAL_CRON, () => {
  tick().catch((err) => log.error("tick failed", { error: (err as Error).message }));
});

// Also run once at startup so a fresh deploy doesn't wait up to an hour.
tick().catch((err) => log.error("initial tick failed", { error: (err as Error).message }));
