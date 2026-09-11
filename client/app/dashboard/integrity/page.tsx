"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertOctagon } from "lucide-react";
import { getDocuments, verifyIntegrity } from "@/lib/api";
import type { DocumentRecord } from "@/lib/types";
import HashStatus from "@/components/HashStatus";
import { LoadingState } from "@/components/LoadingState";

export default function IntegrityPage() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ storedHash: string; currentHash: string; match: boolean } | null>(null);

  useEffect(() => {
    getDocuments().then((docs) => {
      setDocuments(docs);
      if (docs[0]) setSelectedId(docs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId || !documents) return;
    const doc = documents.find((d) => d.id === selectedId);
    if (doc) setResult({ storedHash: doc.storedHash, currentHash: doc.currentHash, match: doc.storedHash === doc.currentHash });
  }, [selectedId, documents]);

  async function handleReverify() {
    if (!selectedId) return;
    setChecking(true);
    try {
      const res = await verifyIntegrity(selectedId);
      setResult(res);
    } finally {
      setChecking(false);
    }
  }

  if (!documents) return <LoadingState label="Loading documents…" />;

  const selectedDoc = documents.find((d) => d.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Document Integrity</h1>
        <p className="text-sm text-ink-500">Frontend displays backend verification results — it is not the authority that decides integrity.</p>
      </div>

      <div className="max-w-sm">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600"
        >
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.name} — v{d.version}</option>
          ))}
        </select>
      </div>

      {result && selectedDoc && (
        <div className="max-w-xl space-y-4">
          <HashStatus storedHash={result.storedHash} currentHash={result.currentHash} />

          {!result.match && (
            <div className="flex items-start gap-3 rounded-card border border-status-critical/30 bg-status-criticalBg p-4">
              <AlertOctagon className="mt-0.5 text-status-critical" size={20} />
              <div>
                <p className="font-semibold text-status-critical">SECURITY ALERT — INTEGRITY FAILURE</p>
                <p className="text-sm text-ink-700">Possible unauthorized modification detected on {selectedDoc.name}.</p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReverify}
              disabled={checking}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {checking ? "Re-verifying…" : "Re-Verify"}
            </button>
            <Link
              href="/dashboard/audit"
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            >
              View Audit Trail
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
