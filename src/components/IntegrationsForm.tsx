"use client";

import { useEffect, useState } from "react";

type Settings = {
  mal_client_id: string | null;
  mal_client_secret: string | null;
  anilist_client_id: string | null;
  anilist_client_secret: string | null;
  shikimori_client_id: string | null;
  shikimori_client_secret: string | null;
  shikimori_app_name: string | null;
};

const EMPTY: Settings = {
  mal_client_id: "",
  mal_client_secret: "",
  anilist_client_id: "",
  anilist_client_secret: "",
  shikimori_client_id: "",
  shikimori_client_secret: "",
  shikimori_app_name: "",
};

export default function IntegrationsForm() {
  const [values, setValues] = useState<Settings>(EMPTY);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        // /api/settings reports unset/secret fields as null; coalesce to ""
        // so re-saving the form doesn't send null back for untouched fields.
        const settings = data.settings ?? {};
        setValues({
          ...EMPTY,
          ...Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v ?? ""])),
        });
        setConfigured(data.configured ?? {});
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setMessage("Saved. Secrets are stored but not shown again.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-1 font-medium">Integrations</h2>
      <p className="mb-4 text-sm text-muted">
        API credentials for each service. Users can only connect accounts for services configured here.
      </p>

      <Provider
        title="MyAnimeList"
        configured={configured.mal}
        idValue={values.mal_client_id ?? ""}
        secretValue={values.mal_client_secret ?? ""}
        onIdChange={(v) => setValues((s) => ({ ...s, mal_client_id: v }))}
        onSecretChange={(v) => setValues((s) => ({ ...s, mal_client_secret: v }))}
        help="Create an app at myanimelist.net/apiconfig. Redirect URI must be <your app URL>/api/connections/MAL/callback."
      />
      <Provider
        title="AniList"
        configured={configured.anilist}
        idValue={values.anilist_client_id ?? ""}
        secretValue={values.anilist_client_secret ?? ""}
        onIdChange={(v) => setValues((s) => ({ ...s, anilist_client_id: v }))}
        onSecretChange={(v) => setValues((s) => ({ ...s, anilist_client_secret: v }))}
        help="Create an app at anilist.co/settings/developer. Redirect URI: <your app URL>/api/connections/ANILIST/callback."
      />
      <Provider
        title="Shikimori"
        configured={configured.shikimori}
        idValue={values.shikimori_client_id ?? ""}
        secretValue={values.shikimori_client_secret ?? ""}
        onIdChange={(v) => setValues((s) => ({ ...s, shikimori_client_id: v }))}
        onSecretChange={(v) => setValues((s) => ({ ...s, shikimori_client_secret: v }))}
        help="Create an app at shikimori.one/oauth/applications. Redirect URI: <your app URL>/api/connections/SHIKIMORI/callback."
      >
        <label className="mt-2 flex flex-col gap-1 text-sm">
          App name (sent as User-Agent, required by Shikimori)
          <input
            value={values.shikimori_app_name ?? ""}
            onChange={(e) => setValues((s) => ({ ...s, shikimori_app_name: e.target.value }))}
            className="rounded-md px-3 py-2"
            placeholder="AniSync"
          />
        </label>
      </Provider>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="text-sm text-muted">{message}</span>}
      </div>
    </section>
  );
}

function Provider({
  title,
  configured,
  idValue,
  secretValue,
  onIdChange,
  onSecretChange,
  help,
  children,
}: {
  title: string;
  configured?: boolean;
  idValue: string;
  secretValue: string;
  onIdChange: (v: string) => void;
  onSecretChange: (v: string) => void;
  help: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-medium">{title}</h3>
        <span className={`text-xs ${configured ? "text-success" : "text-muted"}`}>
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>
      <p className="mb-2 text-xs text-muted">{help}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Client ID
          <input value={idValue} onChange={(e) => onIdChange(e.target.value)} className="rounded-md px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Client secret
          <input
            value={secretValue}
            onChange={(e) => onSecretChange(e.target.value)}
            className="rounded-md px-3 py-2"
            placeholder={configured ? "•••••••• (unchanged)" : ""}
          />
        </label>
      </div>
      {children}
    </div>
  );
}
