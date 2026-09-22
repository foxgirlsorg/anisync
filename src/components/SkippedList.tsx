"use client";

import { useState } from "react";

export default function SkippedList({ entries }: { entries: { malId: number; title: string; reason: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-xs text-accent">
        {open ? "Hide" : "Show"} {entries.length} skipped title{entries.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-muted">
          {entries.map((e) => (
            <li key={e.malId} className="border-t border-border py-1 first:border-t-0">
              <span className="text-foreground">{e.title}</span> — {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
