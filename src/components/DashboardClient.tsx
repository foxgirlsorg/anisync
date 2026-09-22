"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICES, SERVICE_LABELS, ServiceId } from "@/lib/constants";

type Props = {
  email: string;
  connections: { service: string; externalUsername: string | null }[];
  sourceService: string | null;
  autoSyncEnabled: boolean;
  callbackNotice: { status: "connected" | "error"; service?: string; message?: string } | null;
};

export default function DashboardClient({ email, connections, sourceService, autoSyncEnabled, callbackNotice }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const connectedByService = new Map(connections.map((c) => [c.service, c]));

  async function disconnect(service: ServiceId) {
    setDisconnecting(service);
    await fetch(`/api/connections/${service}`, { method: "DELETE" });
    setDisconnecting(null);
    router.refresh();
  }

  async function runSyncNow() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncMessage("Sync started — check History for results.");
    } catch (err) {
      setSyncMessage((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome, {email}</h1>
        <p className="text-sm text-muted">Connect your accounts, then configure sync in Sync settings.</p>
      </div>

      {callbackNotice && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            callbackNotice.status === "connected" ? "border-success text-success" : "border-danger text-danger"
          }`}
        >
          {callbackNotice.status === "connected"
            ? `${SERVICE_LABELS[callbackNotice.service as ServiceId] ?? callbackNotice.service} connected.`
            : `Couldn't connect ${SERVICE_LABELS[callbackNotice.service as ServiceId] ?? callbackNotice.service}: ${callbackNotice.message}`}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {SERVICES.map((service) => {
          const conn = connectedByService.get(service);
          const isSource = sourceService === service;
          return (
            <div key={service} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{SERVICE_LABELS[service]}</span>
                {isSource && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">Source</span>}
              </div>
              {conn ? (
                <>
                  <p className="text-sm text-muted">Connected as {conn.externalUsername}</p>
                  <button
                    onClick={() => disconnect(service)}
                    disabled={disconnecting === service}
                    className="mt-1 rounded-md border border-border py-1.5 text-sm text-danger disabled:opacity-50"
                  >
                    {disconnecting === service ? "Disconnecting…" : "Disconnect"}
                  </button>
                </>
              ) : (
                <a
                  href={`/api/connections/${service}/authorize`}
                  className="mt-1 rounded-md bg-accent py-1.5 text-center text-sm font-medium text-accent-foreground"
                >
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Manual sync</h2>
            <p className="text-sm text-muted">
              Auto-sync is {autoSyncEnabled ? "on" : "off"} — configure it in{" "}
              <a href="/dashboard/sync" className="text-accent">
                Sync settings
              </a>
              .
            </p>
          </div>
          <button
            onClick={runSyncNow}
            disabled={syncing || !sourceService}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Run sync now"}
          </button>
        </div>
        {!sourceService && <p className="mt-2 text-sm text-muted">Pick a source account in Sync settings first.</p>}
        {syncMessage && <p className="mt-2 text-sm">{syncMessage}</p>}
      </section>
    </div>
  );
}
