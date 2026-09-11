"use client";

import { useState } from "react";
import type { AuditEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import StatusBadge from "./StatusBadge";

function formatAction(action: string): string {
  const value = String(action ?? "")
    .trim()
    .toLowerCase();

  switch (value) {
    case "document_uploaded":
    case "uploaded":
    case "upload":
      return "DOCUMENT UPLOADED";

    case "document_verified":
    case "verified":
    case "verify":
      return "DOCUMENT VERIFIED";

    case "document_viewed":
    case "viewed":
    case "view":
    case "accessed":
      return "DOCUMENT VIEWED";

    case "document_downloaded":
    case "downloaded":
    case "download":
      return "DOCUMENT DOWNLOADED";

    case "document_transferred":
    case "transferred":
    case "transfer":
      return "DOCUMENT TRANSFERRED";

    case "access_denied":
      return "ACCESS DENIED";

    case "version_created":
    case "created_version":
      return "VERSION CREATED";

    case "integrity_mismatch":
      return "INTEGRITY MISMATCH";

    case "login_success":
      return "LOGIN SUCCESS";

    case "login_failed":
      return "LOGIN FAILED";

    default:
      return String(action ?? "SYSTEM EVENT")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) =>
          char.toUpperCase()
        );
  }
}

function getStatusTone(
  status: AuditEvent["ledgerStatus"]
) {
  switch (status) {
    case "verified":
      return "verified";

    case "flagged":
      return "critical";

    default:
      return "info";
  }
}

function getStatusLabel(
  status: AuditEvent["ledgerStatus"]
) {
  switch (status) {
    case "verified":
      return "Verified";

    case "flagged":
      return "Flagged";

    default:
      return "Pending";
  }
}

export default function AuditTable({
  events,
}: {
  events: AuditEvent[];
}) {
  const [selected, setSelected] =
    useState<AuditEvent | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-card border border-surface-border bg-surface-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-muted text-ink-500">
              <th className="px-4 py-3 font-medium">
                Time
              </th>

              <th className="px-4 py-3 font-medium">
                User
              </th>

              <th className="px-4 py-3 font-medium">
                Action
              </th>

              <th className="px-4 py-3 font-medium">
                Document
              </th>

              <th className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                onClick={() =>
                  setSelected(event)
                }
                className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-muted"
              >
                <td className="px-4 py-3 text-ink-700">
                  {formatDateTime(
                    event.timestamp
                  )}
                </td>

                <td className="px-4 py-3 text-ink-700">
                  {event.user}
                </td>

                <td className="px-4 py-3 font-medium text-ink-900">
                  {formatAction(
                    event.action
                  )}
                </td>

                <td className="px-4 py-3 text-ink-700">
                  {event.documentName ||
                    "System Event"}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge
                    tone={getStatusTone(
                      event.ledgerStatus
                    )}
                    label={getStatusLabel(
                      event.ledgerStatus
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Event detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-ink-900/40"
          onClick={() =>
            setSelected(null)
          }
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink-900">
                Event Details
              </h3>

              <button
                type="button"
                onClick={() =>
                  setSelected(null)
                }
                className="text-ink-500 hover:text-ink-900"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  Event ID
                </dt>

                <dd className="break-all text-right font-medium text-ink-900">
                  {selected.id}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  Document
                </dt>

                <dd className="text-right font-medium text-ink-900">
                  {selected.documentName ||
                    "System Event"}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  User
                </dt>

                <dd className="text-right font-medium text-ink-900">
                  {selected.user}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  Action
                </dt>

                <dd className="text-right font-medium text-ink-900">
                  {formatAction(
                    selected.action
                  )}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  Timestamp
                </dt>

                <dd className="text-right font-medium text-ink-900">
                  {formatDateTime(
                    selected.timestamp
                  )}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-surface-border pb-2">
                <dt className="text-ink-500">
                  Document Hash
                </dt>

                <dd className="max-w-[240px] break-all text-right font-mono text-xs font-medium text-ink-900">
                  {selected.documentHash ||
                    "Not available"}
                </dd>
              </div>

              <div className="flex items-center justify-between pt-1">
                <dt className="text-ink-500">
                  Ledger Status
                </dt>

                <dd>
                  <StatusBadge
                    tone={getStatusTone(
                      selected.ledgerStatus
                    )}
                    label={getStatusLabel(
                      selected.ledgerStatus
                    )}
                  />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}