"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, UploadCloud } from "lucide-react";
import { getDocuments } from "@/lib/api";
import type { DocumentRecord, DocumentType } from "@/lib/types";
import DocumentTable from "@/components/DocumentTable";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";

const TYPE_FILTERS: { label: string; value: DocumentType | "All" }[] = [
  { label: "All", value: "All" },
  { label: "FIR", value: "FIR" },
  { label: "Reports", value: "Investigation Report" },
  { label: "Forensic", value: "Forensic Report" },
  { label: "Court", value: "Court Document" },
  { label: "Evidence", value: "Evidence" },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [type, setType] = useState<DocumentType | "All">("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getDocuments().then(setDocuments).catch(() => setError(true));
  }, []);

  if (error) return <EmptyState kind="error" description="Could not load documents. Try again shortly." />;
  if (!documents) return <LoadingState label="Loading documents…" />;

  const filtered = documents.filter((d) => {
    const matchesType = type === "All" || d.type === type;
    const matchesQuery = query.trim() === "" || d.name.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Documents</h1>
          <p className="text-sm text-ink-500">All documents you're authorized to view.</p>
        </div>
        <Link
          href="/dashboard/documents/upload"
          className="flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
        >
          <UploadCloud size={16} />
          Upload
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm focus:border-navy-600"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setType(f.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                type === f.value ? "bg-navy-800 text-white" : "bg-white text-ink-700 border border-surface-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState kind="empty" description="No documents match your search or filter." />
      ) : (
        <DocumentTable documents={filtered} />
      )}
    </div>
  );
}
