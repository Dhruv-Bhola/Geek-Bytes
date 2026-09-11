"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertOctagon, ShieldCheck } from "lucide-react";

import { getDocuments, verifyIntegrity } from "@/lib/api";
import type { DocumentRecord } from "@/lib/types";
import HashStatus from "@/components/HashStatus";
import { LoadingState } from "@/components/LoadingState";

export default function IntegrityPage() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [result, setResult] = useState<{
    storedHash: string;
    currentHash: string;
    match: boolean;
  } | null>(null);

  // Load documents
  useEffect(() => {
    getDocuments().then((docs) => {
      setDocuments(docs);

      if (docs[0]) {
        setSelectedId(docs[0].id);
      }
    });
  }, []);

  // Update verification result when document changes
  useEffect(() => {
    if (!selectedId || !documents) return;

    const doc = documents.find((d) => d.id === selectedId);

    if (doc) {
      setResult({
        storedHash: doc.storedHash,
        currentHash: doc.currentHash,
        match: doc.storedHash === doc.currentHash,
      });
    }
  }, [selectedId, documents]);

  // Re-verify document
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

  // Loading state
  if (!documents) {
    return <LoadingState label="Loading documents…" />;
  }

  const selectedDoc = documents.find(
    (d) => d.id === selectedId
  );

  return (
    <div className="space-y-6">
      {/* =========================
          PAGE HEADER
      ========================== */}
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-800">
          <ShieldCheck
            size={21}
            className="text-white"
          />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            Document Integrity
          </h1>

          <p className="mt-1 text-sm text-ink-500">
            Verify that a document has not been modified since
            its original hash was recorded.
          </p>
        </div>
      </div>

      {/* =========================
          DOCUMENT SELECTOR
      ========================== */}
      <div className="max-w-xl">
        <label
          htmlFor="document-select"
          className="mb-2 block text-sm font-medium text-ink-700"
        >
          Select document
        </label>

        <select
          id="document-select"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="
            w-full
            rounded-lg
            border border-surface-border
            bg-white
            px-4 py-3
            text-sm text-ink-900
            shadow-sm
            outline-none
            transition
            focus:border-navy-600
            focus:ring-2
            focus:ring-navy-600/10
          "
        >
          {documents.map((d) => (
            <option
              key={d.id}
              value={d.id}
            >
              {d.name} — v{d.version}
            </option>
          ))}
        </select>
      </div>

      {/* =========================
          VERIFICATION CONTENT
      ========================== */}
      {result && selectedDoc && (
        <div className="max-w-4xl space-y-5">

          {/* Hash Status Card */}
          <HashStatus
            storedHash={result.storedHash}
            currentHash={result.currentHash}
          />

          {/* =========================
              SECURITY ALERT
          ========================== */}
          {!result.match && (
            <div
              className="
                flex
                items-start
                gap-3
                rounded-card
                border border-status-critical/30
                bg-status-criticalBg
                p-4
              "
            >
              <AlertOctagon
                className="mt-0.5 shrink-0 text-status-critical"
                size={21}
              />

              <div>
                <p className="font-semibold text-status-critical">
                  SECURITY ALERT — INTEGRITY FAILURE
                </p>

                <p className="mt-1 text-sm text-ink-700">
                  Possible unauthorized modification detected on{" "}
                  <span className="font-medium">
                    {selectedDoc.name}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {/* =========================
              ACTION BUTTONS
          ========================== */}
          <div className="flex flex-wrap gap-3">
            {/* Re-Verify */}
            <button
              onClick={handleReverify}
              disabled={checking}
              className="
                rounded-lg
                bg-navy-800
                px-5 py-2.5
                text-sm font-medium
                text-white
                shadow-sm
                transition
                hover:bg-navy-700
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              {checking
                ? "Re-verifying…"
                : "Re-Verify Document"}
            </button>

            {/* Audit Trail */}
            <Link
              href="/dashboard/audit"
              className="
                rounded-lg
                border border-surface-border
                bg-white
                px-5 py-2.5
                text-sm font-medium
                text-ink-700
                transition
                hover:bg-surface-muted
              "
            >
              View Audit Trail
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}