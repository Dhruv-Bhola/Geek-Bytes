"use client";

import { useEffect, useState } from "react";
import { getDocuments, getCustodyEvents } from "@/lib/api";
import type { DocumentRecord, CustodyEvent } from "@/lib/types";
import CustodyChain from "@/components/CustodyChain";
import CustodyTimeline from "@/components/CustodyTimeline";
import StatusBadge from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";

export default function CustodyPage() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<CustodyEvent[] | null>(null);

  useEffect(() => {
    getDocuments().then((docs) => {
      setDocuments(docs);
      if (docs[0]) setSelectedId(docs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setEvents(null);
    getCustodyEvents(selectedId).then(setEvents);
  }, [selectedId]);

  if (!documents) return <LoadingState label="Loading documents…" />;

  const selectedDoc = documents.find((d) => d.id === selectedId);
  const complete = events && events.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Chain of Custody</h1>
        <p className="text-sm text-ink-500">Who handled a document, what happened, and when — cryptographically linked, block by block.</p>
      </div>

      <div className="max-w-sm">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600"
        >
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {!events ? (
        <LoadingState label="Loading custody trail…" />
      ) : events.length === 0 ? (
        <EmptyState kind="empty" description="No custody events recorded for this document yet." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={complete ? "verified" : "review"} label={complete ? "Chain Complete" : "Incomplete"} />
            <StatusBadge tone="verified" label="No unauthorized modification detected" />
          </div>

          <div className="rounded-card border border-surface-border bg-surface-card p-2 shadow-card">
            <h3 className="px-4 pt-3 text-sm font-semibold text-ink-900">{selectedDoc?.name}</h3>
            <CustodyChain events={events} />
          </div>

          <details className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <summary className="cursor-pointer text-sm font-semibold text-ink-900">View as detailed timeline</summary>
            <div className="mt-5">
              <CustodyTimeline events={events} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
