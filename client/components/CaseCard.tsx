import Link from "next/link";
import type { Case } from "@/lib/types";
import StatusBadge from "./StatusBadge";

const STATUS_TONE = { active: "verified", review: "review", closed: "info" } as const;
const STATUS_LABEL = { active: "ACTIVE", review: "REVIEW", closed: "CLOSED" } as const;

export default function CaseCard({ item }: { item: Case }) {
  return (
    <Link
      href={`/dashboard/cases/${item.id}`}
      className="block rounded-card border border-surface-border bg-surface-card p-5 shadow-card transition hover:border-navy-600"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
            Case #{item.id}
          </p>
          <h3 className="mt-1 font-semibold text-ink-900">{item.title}</h3>
        </div>
        <StatusBadge tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
      </div>
      <p className="mt-3 text-sm text-ink-500">{item.department}</p>
      <p className="text-sm text-ink-500">FIR: {item.firNumber}</p>
    </Link>
  );
}
