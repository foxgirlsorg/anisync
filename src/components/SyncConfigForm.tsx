"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_LABELS, ServiceId } from "@/lib/constants";

type Destination = {
  service: string;
  enabled: boolean;
  destructive: boolean;
  importAnime: boolean;
  importManga: boolean;
  importStatus: boolean;
  importProgress: boolean;
  importRatings: boolean;
  ratingRoundMode: "NEAREST" | "UP" | "DOWN";
  importComments: boolean;
  importCustomLists: boolean;
  importStartDate: boolean;
  importFinishDate: boolean;
  importRewatches: boolean;
  importPriority: boolean;
};

const TOGGLE_FIELDS: { key: keyof Destination; label: string }[] = [
  { key: "importAnime", label: "Sync anime" },
  { key: "importManga", label: "Sync manga" },
  { key: "importStatus", label: "Title status changes" },
  { key: "importProgress", label: "Episode/chapter progress" },
  { key: "importRatings", label: "Ratings" },
  { key: "importComments", label: "Comments" },
  { key: "importCustomLists", label: "Custom lists / tags" },
  { key: "importStartDate", label: "Start date" },
  { key: "importFinishDate", label: "Finish date" },
  { key: "importRewatches", label: "Rewatch/reread count" },
  { key: "importPriority", label: "Priority (MAL only)" },
];

export default function SyncConfigForm({
  connectedServices,
  sourceService: initialSource,
  autoSyncEnabled: initialAutoSync,
  destinations: initialDestinations,
}: {
  connectedServices: string[];
  sourceService: string | null;
  autoSyncEnabled: boolean;
  destinations: Destination[];
}) {
  const router = useRouter();
  const [sourceService, setSourceService] = useState(initialSource);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(initialAutoSync);
  const [destinations, setDestinations] = useState(initialDestinations);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateDest(service: string, patch: Partial<Destination>) {
    setDestinations((ds) => ds.map((d) => (d.service === service ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceService,
          autoSyncEnabled,
          destinations: destinations.map((d) => ({ ...d, enabled: d.service === sourceService ? false : d.enabled })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setMessage("Saved.");
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (connectedServices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        Connect at least one account from the Dashboard before configuring sync.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Sync settings</h1>
        <p className="text-sm text-muted">Choose which account is the source of truth, then tune each destination.</p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 font-medium">Source account</h2>
        <div className="flex flex-wrap gap-3">
          {connectedServices.map((service) => (
            <label
              key={service}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
                sourceService === service ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              <input
                type="radio"
                name="source"
                className="mr-2"
                checked={sourceService === service}
                onChange={() => setSourceService(service)}
              />
              {SERVICE_LABELS[service as ServiceId]}
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoSyncEnabled} onChange={(e) => setAutoSyncEnabled(e.target.checked)} />
          Auto-sync every 24 hours
        </label>
      </section>

      {connectedServices
        .filter((s) => s !== sourceService)
        .map((service) => {
          const dest = destinations.find((d) => d.service === service);
          if (!dest) return null;
          return (
            <section key={service} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium">{SERVICE_LABELS[service as ServiceId]} (destination)</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dest.enabled}
                    onChange={(e) => updateDest(service, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dest.destructive}
                    onChange={(e) => updateDest(service, { destructive: e.target.checked })}
                  />
                  Destructive import — also remove titles here that aren&apos;t in the source list
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {TOGGLE_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(dest[f.key])}
                      onChange={(e) => updateDest(service, { [f.key]: e.target.checked } as Partial<Destination>)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>

              {dest.importRatings && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  Rating conversion rounding
                  <select
                    value={dest.ratingRoundMode}
                    onChange={(e) => updateDest(service, { ratingRoundMode: e.target.value as Destination["ratingRoundMode"] })}
                    className="rounded-md px-2 py-1"
                  >
                    <option value="NEAREST">Nearest</option>
                    <option value="UP">Round up</option>
                    <option value="DOWN">Round down</option>
                  </select>
                </label>
              )}
            </section>
          );
        })}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !sourceService}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {message && <span className="text-sm text-muted">{message}</span>}
      </div>
    </div>
  );
}
