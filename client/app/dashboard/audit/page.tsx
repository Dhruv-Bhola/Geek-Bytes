"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { getAuditEvents } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import AuditTable from "@/components/AuditTable";
import AuditChainStrip from "@/components/AuditChainStrip";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getAuditEvents().then(setEvents).catch(() => setError(true));
  }, []);

  if (error) return <EmptyState kind="error" description="Could not load the audit ledger." />;
  if (!events) return <LoadingState label="Loading audit ledger…" />;

  const filtered = events.filter((e) =>
    query.trim() === "" ||
    e.documentName.toLowerCase().includes(query.toLowerCase()) ||
    e.user.toLowerCase().includes(query.toLowerCase()) ||
    e.action.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Audit Ledger</h1>
        <p className="text-sm text-ink-500">A tamper-evident record of document activity — read-only for normal users.</p>
      </div>

      <AuditChainStrip events={events} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search document / user / action / case"
          className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm focus:border-navy-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState kind="empty" description="No audit events match your search." />
      ) : (
        <AuditTable events={filtered} />
      )}
    </div>
  );
}
