import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_LABELS, ServiceId } from "@/lib/constants";
import SkippedList from "@/components/SkippedList";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const runs = await prisma.syncRun.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { results: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Sync history</h1>
      {runs.length === 0 && <p className="text-sm text-muted">No syncs yet — run one from the Dashboard.</p>}
      {runs.map((run) => (
        <div key={run.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <span
                className={
                  run.status === "success" ? "text-success" : run.status === "error" ? "text-danger" : "text-muted"
                }
              >
                {run.status}
              </span>{" "}
              <span className="text-muted">· {run.trigger}</span>
            </div>
            <time className="text-muted">{run.startedAt.toLocaleString()}</time>
          </div>
          {run.errorMessage && <p className="mt-2 text-sm text-danger">{run.errorMessage}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {run.results.map((r) => {
              const skipped: { malId: number; title: string; reason: string }[] = r.skippedEntries
                ? JSON.parse(r.skippedEntries)
                : [];
              return (
                <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium">{SERVICE_LABELS[r.destinationService as ServiceId]}</div>
                  <div className="mt-1 flex flex-wrap gap-4 text-muted">
                    <span>{r.created} created</span>
                    <span>{r.updated} updated</span>
                    <span>{r.unchanged} already up to date</span>
                    <span className={r.skipped > 0 ? "text-danger" : ""}>{r.skipped} skipped</span>
                  </div>
                  {skipped.length > 0 && <SkippedList entries={skipped} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
