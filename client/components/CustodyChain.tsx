"use client";

import { motion } from "framer-motion";
import {
  Upload,
  Eye,
  Download,
  GitBranch,
  ShieldCheck,
  Link2,
  User,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import type { CustodyEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

type ActionConfig = {
  Icon: typeof Upload;
  tone: string;
  label: string;
};

const ACTION_CONFIG: Record<
  string,
  ActionConfig
> = {
  "UPLOADED DOCUMENT": {
    Icon: Upload,
    tone:
      "bg-status-infoBg text-status-info",
    label: "UPLOADED DOCUMENT",
  },

  "VIEWED DOCUMENT": {
    Icon: Eye,
    tone:
      "bg-surface-muted text-ink-500",
    label: "VIEWED DOCUMENT",
  },

  "DOWNLOADED DOCUMENT": {
    Icon: Download,
    tone:
      "bg-surface-muted text-ink-500",
    label: "DOWNLOADED DOCUMENT",
  },

  "CREATED VERSION": {
    Icon: GitBranch,
    tone:
      "bg-status-reviewBg text-status-review",
    label: "CREATED VERSION",
  },

  "VERIFIED INTEGRITY": {
    Icon: ShieldCheck,
    tone:
      "bg-status-verifiedBg text-status-verified",
    label: "VERIFIED INTEGRITY",
  },

  "TRANSFERRED DOCUMENT": {
    Icon: ArrowRightLeft,
    tone:
      "bg-status-reviewBg text-status-review",
    label: "TRANSFERRED DOCUMENT",
  },

  "ACCESS DENIED": {
    Icon: AlertTriangle,
    tone:
      "bg-status-criticalBg text-status-critical",
    label: "ACCESS DENIED",
  },
};

/**
 * Convert backend audit/custody action names into the labels
 * expected by the UI.
 */
function normalizeAction(
  action: unknown
): string {
  const value = String(
    action ?? ""
  )
    .trim()
    .toLowerCase();

  switch (value) {
    case "document_uploaded":
    case "uploaded":
    case "upload":
    case "uploaded document":
      return "UPLOADED DOCUMENT";

    case "document_viewed":
    case "viewed":
    case "view":
    case "accessed":
    case "viewed document":
      return "VIEWED DOCUMENT";

    case "document_downloaded":
    case "downloaded":
    case "download":
    case "downloaded document":
      return "DOWNLOADED DOCUMENT";

    case "version_created":
    case "created_version":
    case "created version":
      return "CREATED VERSION";

    case "document_verified":
    case "verified":
    case "verify":
    case "verified integrity":
      return "VERIFIED INTEGRITY";

    case "document_transferred":
    case "transferred":
    case "transfer":
    case "transferred document":
      return "TRANSFERRED DOCUMENT";

    case "access_denied":
    case "denied":
      return "ACCESS DENIED";

    default:
      return String(
        action ?? "DOCUMENT EVENT"
      )
        .replace(
          /_/g,
          " "
        )
        .toUpperCase();
  }
}

/**
 * Safely resolve the visual configuration.
 *
 * Unknown backend actions no longer crash the component.
 */
function getActionConfig(
  action: unknown
): ActionConfig {
  const normalized =
    normalizeAction(action);

  return (
    ACTION_CONFIG[
      normalized
    ] ?? {
      Icon: FileEventIcon,
      tone:
        "bg-surface-muted text-ink-500",
      label: normalized,
    }
  );
}

/**
 * Fallback icon for a future/unknown event.
 */
function FileEventIcon({
  size,
}: {
  size?: number;
}) {
  return (
    <GitBranch
      size={size ?? 15}
    />
  );
}

/**
 * Renders custody events as a connected,
 * left-to-right chain of blocks.
 */
export default function CustodyChain({
  events,
}: {
  events: CustodyEvent[];
}) {
  if (
    !events ||
    events.length === 0
  ) {
    return null;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-0 px-1 py-4">
        {events.map(
          (
            event,
            i
          ) => {
            const cfg =
              getActionConfig(
                event.action
              );

            const displayAction =
              normalizeAction(
                event.action
              );

            return (
              <div
                key={
                  event.id ??
                  `${displayAction}-${i}`
                }
                className="flex items-center"
              >
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 14,
                    scale: 0.96,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                  }}
                  transition={{
                    duration: 0.35,
                    delay:
                      i * 0.1,
                    ease: "easeOut",
                  }}
                  className="w-56 rounded-card border border-surface-border bg-surface-card p-4 shadow-card"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.tone}`}
                    >
                      <cfg.Icon
                        size={15}
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink-900">
                        {cfg.label}
                      </p>

                      <p className="flex items-center gap-1 truncate text-xs text-ink-500">
                        <User
                          size={11}
                        />

                        {event.actor ??
                          "Unknown"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-ink-400">
                    {formatDateTime(
                      event.timestamp
                    )}
                  </p>

                  {event.hash && (
                    <p className="mt-1.5 truncate rounded bg-surface-muted px-1.5 py-1 font-mono text-[11px] text-ink-500">
                      #{event.hash}
                    </p>
                  )}

                  {"blockchainTxHash" in
                    event &&
                    (event as any)
                      .blockchainTxHash && (
                      <p className="mt-1.5 truncate rounded bg-surface-muted px-1.5 py-1 font-mono text-[10px] text-ink-400">
                        TX:{" "}
                        {
                          (
                            event as any
                          )
                            .blockchainTxHash
                        }
                      </p>
                    )}

                </motion.div>

                {i <
                  events.length -
                    1 && (
                  <motion.div
                    initial={{
                      scaleX: 0,
                      opacity: 0,
                    }}
                    animate={{
                      scaleX: 1,
                      opacity: 1,
                    }}
                    transition={{
                      duration: 0.3,
                      delay:
                        i * 0.1 +
                        0.25,
                    }}
                    style={{
                      transformOrigin:
                        "left",
                    }}
                    className="flex w-10 shrink-0 items-center justify-center"
                  >
                    <div className="flex items-center gap-1 text-navy-600">
                      <span className="h-px w-4 bg-surface-border" />

                      <Link2
                        size={13}
                      />

                      <span className="h-px w-4 bg-surface-border" />
                    </div>
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