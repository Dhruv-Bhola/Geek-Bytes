"use client";

import Link from "next/link";
import type { DocumentRecord } from "@/lib/types";
import StatusBadge from "./StatusBadge";

const INTEGRITY_TONE = {
  verified: "verified",
  review: "review",
  mismatch: "critical",
} as const;

const INTEGRITY_LABEL = {
  verified: "Integrity Verified",
  review: "Needs Review",
  mismatch: "Integrity Failure",
} as const;

export default function DocumentTable({ documents }: { documents: DocumentRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-surface-border bg-surface-card shadow-card">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-muted text-ink-500">
            <th className="px-4 py-3 font-medium">Document</th>
            <th className="px-4 py-3 font-medium">Case</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Version</th>
            <th className="px-4 py-3 font-medium">Integrity</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b border-surface-border last:border-0 hover:bg-surface-muted">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/documents/${doc.id}`}
                  className="font-medium text-navy-800 hover:underline"
                >
                  {doc.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-700">
                <Link href={`/dashboard/cases/${doc.caseId}`} className="hover:underline">
                  #{doc.caseId}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-700">{doc.type}</td>
              <td className="px-4 py-3 text-ink-700">v{doc.version}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  tone={INTEGRITY_TONE[doc.integrityStatus]}
                  label={INTEGRITY_LABEL[doc.integrityStatus]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
