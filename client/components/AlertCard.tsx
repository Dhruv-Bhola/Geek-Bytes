"use client";

import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

import type { SecurityAlert } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

type AlertConfig = {
  Icon: typeof AlertCircle;
  border: string;
  badgeBg: string;
  badgeText: string;
  label: string;
};

const SEVERITY_CONFIG: Record<
  string,
  AlertConfig
> = {
  critical: {
    Icon: AlertCircle,
    border:
      "border-l-status-critical",
    badgeBg:
      "bg-status-criticalBg",
    badgeText:
      "text-status-critical",
    label: "CRITICAL",
  },

  high: {
    Icon: AlertTriangle,
    border:
      "border-l-status-review",
    badgeBg:
      "bg-status-reviewBg",
    badgeText:
      "text-status-review",
    label: "HIGH",
  },

  medium: {
    Icon: AlertTriangle,
    border:
      "border-l-status-review",
    badgeBg:
      "bg-status-reviewBg",
    badgeText:
      "text-status-review",
    label: "MEDIUM",
  },

  low: {
    Icon: Info,
    border:
      "border-l-status-info",
    badgeBg:
      "bg-status-infoBg",
    badgeText:
      "text-status-info",
    label: "LOW",
  },
};

function getSeverityConfig(
  severity: unknown
): AlertConfig {
  const value = String(
    severity ?? "medium"
  ).toLowerCase();

  return (
    SEVERITY_CONFIG[value] ??
    SEVERITY_CONFIG.medium
  );
}

function formatStatus(
  status: unknown
): string {
  return String(
    status ?? ""
  )
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

export default function AlertCard({
  alert,
}: {
  alert: SecurityAlert;
}) {
  const cfg =
    getSeverityConfig(
      alert.severity
    );

  const Icon =
    cfg.Icon;

  const isResolved =
    String(
      (alert as any)
        ?.status ?? ""
    ).toLowerCase() ===
    "resolved";

  return (
    <div
      className={`flex items-start gap-3 rounded-card border border-surface-border border-l-4 ${cfg.border} bg-surface-card p-4 shadow-card`}
    >
      <Icon
        className={cfg.badgeText}
        size={20}
      />

      <div className="flex-1">
  <div className="flex flex-wrap items-center gap-2">
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}
    >
      {cfg.label}
    </span>

    {isResolved && (
      <span className="flex items-center gap-1 rounded-full bg-status-verifiedBg px-2 py-0.5 text-xs font-semibold text-status-verified">
        <CheckCircle2 size={12} />
        RESOLVED
      </span>
    )}

    <p className="font-medium text-ink-900">
      {alert.title}
    </p>
  </div>

  <p className="mt-1 text-sm text-ink-500">
    {alert.detail}
  </p>

  <p className="mt-1 text-xs text-ink-400">
    {isResolved
      ? `Resolved${alert.resolvedBy ? ` by ${alert.resolvedBy}` : ""}`
      : `Detected ${formatDateTime(alert.detectedAt)}`}
  </p>
</div>
    </div>
  );
}