"use client";

import { motion } from "framer-motion";
import {
  Link2,
  ShieldCheck,
  ShieldAlert,
  Upload,
  Eye,
  Download,
  FileCheck2,
  ArrowRightLeft,
} from "lucide-react";

import type { AuditEvent } from "@/lib/types";

/**
 * Normalize backend audit actions into readable labels.
 */
function formatAction(action: string): string {
  const value = String(
    action ?? ""
  )
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

    case "login_success":
      return "LOGIN SUCCESS";

    case "login_failed":
      return "LOGIN FAILED";

    default:
      return String(
        action ?? "SYSTEM EVENT"
      )
        .replace(
          /_/g,
          " "
        )
        .toUpperCase();
  }
}

/**
 * Returns true for authentication/system events that should not appear
 * in the document-focused tamper-evident chain.
 */
function isDocumentEvent(
  event: AuditEvent
): boolean {
  const action = String(
    event.action ?? ""
  ).toLowerCase();

  return ![
    "login_success",
    "login_failed",
    "logout",
    "password_changed",
    "mfa_verified",
  ].includes(action);
}

/**
 * Choose an icon based on the audit action.
 */
function getActionIcon(
  action: string
) {
  const value = String(
    action ?? ""
  ).toLowerCase();

  if (
    value.includes("upload")
  ) {
    return Upload;
  }

  if (
    value.includes("verify")
  ) {
    return FileCheck2;
  }

  if (
    value.includes("download")
  ) {
    return Download;
  }

  if (
    value.includes("view") ||
    value.includes("access")
  ) {
    return Eye;
  }

  if (
    value.includes("transfer")
  ) {
    return ArrowRightLeft;
  }

  return ShieldCheck;
}

/**
 * A compact visual representation of the tamper-evident audit ledger.
 *
 * The searchable audit table remains the authoritative detailed view.
 */
export default function AuditChainStrip({
  events,
}: {
  events: AuditEvent[];
}) {
  /*
   * Show only document/security events.
   *
   * Newest events arrive first from the backend.
   */
  const recent =
    events
      .filter(isDocumentEvent)
      .slice(0, 6);

  if (
    recent.length === 0
  ) {
    return (
      <div className="rounded-card border border-surface-border bg-navy-950 p-6 text-center text-sm text-white/50">
        No document audit events available.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-surface-border bg-navy-950 p-4">
      <div className="flex min-w-max items-center gap-0">
        {recent.map(
          (
            event,
            i
          ) => {
            const flagged =
              event.ledgerStatus ===
              "flagged";

            const Icon =
              getActionIcon(
                event.action
              );

            const actionLabel =
              formatAction(
                event.action
              );

            return (
              <div
                key={
                  event.id ??
                  `${event.documentId}-${i}`
                }
                className="flex items-center"
              >
                {/* Ledger block */}
                <motion.div
                  initial={{
                    opacity: 0,
                    scale: 0.9,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    duration: 0.3,
                    delay:
                      i * 0.08,
                  }}
                  className="w-44 rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {flagged ? (
                        <ShieldAlert
                          size={14}
                          className="text-status-critical"
                        />
                      ) : (
                        <ShieldCheck
                          size={14}
                          className="text-status-verified"
                        />
                      )}

                      <Icon
                        size={12}
                        className="text-white/50"
                      />
                    </div>

                    <span
                      className={`text-[9px] font-medium uppercase tracking-wide ${
                        flagged
                          ? "text-status-critical"
                          : event.ledgerStatus ===
                              "verified"
                            ? "text-status-verified"
                            : "text-white/40"
                      }`}
                    >
                      {event.ledgerStatus}
                    </span>
                  </div>

                  <p className="mt-2 truncate text-xs font-semibold text-white">
                    {actionLabel}
                  </p>

                  <p className="truncate text-[11px] text-white/50">
                    {event.documentName ||
                      "System Event"}
                  </p>

                  {event.user && (
                    <p className="mt-1 truncate text-[10px] text-white/40">
                      By:{" "}
                      {event.user}
                    </p>
                  )}
                </motion.div>

                {/* Chain connector */}
                {i <
                  recent.length -
                    1 && (
                  <motion.div
                    initial={{
                      opacity: 0,
                    }}
                    animate={{
                      opacity: 1,
                    }}
                    transition={{
                      delay:
                        i * 0.08 +
                        0.2,
                    }}
                    className="flex w-6 shrink-0 justify-center text-white/30"
                  >
                    <Link2
                      size={13}
                    />
                  </motion.div>
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}