"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { getCases } from "@/lib/api";
import type { Case, CaseStatus } from "@/lib/types";
import CaseCard from "@/components/CaseCard";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";

const FILTERS: { label: string; value: CaseStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Review", value: "review" },
  { label: "Closed", value: "closed" },
];

export default function CasesPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getCases().then(setCases).catch(() => setError(true));
  }, []);

  if (error) return <EmptyState kind="error" description="Could not load cases. Try again shortly." />;
  if (!cases) return <LoadingState label="Loading cases…" />;

  const filtered = cases.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesQuery =
      query.trim() === "" ||
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.id.includes(query) ||
      c.firNumber.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Cases</h1>
        <p className="text-sm text-ink-500">Cases within your authorized scope.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search case ID / FIR / title…"
            className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm focus:border-navy-600"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                filter === f.value ? "bg-navy-800 text-white" : "bg-white text-ink-700 border border-surface-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState kind="empty" description="No cases match your search or filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CaseCard key={c.id} item={c} />
          ))}
        </div>
      )}
    </div>
  );
}
