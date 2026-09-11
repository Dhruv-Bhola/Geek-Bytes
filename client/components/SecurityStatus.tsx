"use client";

import {
  CheckCircle2,
  CircleAlert,
  LockKeyhole,
  ShieldCheck,
  Database,
  Activity,
  UserCheck,
} from "lucide-react";

import type { SystemSecurityStatus } from "@/lib/types";

const ROWS: {
  key: keyof SystemSecurityStatus;
  label: string;
  description: string;
  Icon: typeof ShieldCheck;
}[] = [
  {
    key: "encryption",
    label: "Encryption",
    description: "Document encryption",
    Icon: LockKeyhole,
  },
  {
    key: "teeSecurity",
    label: "TEE Security",
    description: "Security-critical operations",
    Icon: ShieldCheck,
  },
  {
    key: "blockchainLedger",
    label: "Blockchain Ledger",
    description: "Tamper-evident audit trail",
    Icon: Database,
  },
  {
    key: "integrityMonitoring",
    label: "Integrity Monitoring",
    description: "SHA-256 verification",
    Icon: Activity,
  },
  {
    key: "accessControl",
    label: "Access Control",
    description: "RBAC and case authorization",
    Icon: UserCheck,
  },
];

export default function SecurityStatus({
  status,
}: {
  status: SystemSecurityStatus;
}) {
  const activeCount = ROWS.filter((row) => Boolean(status?.[row.key])).length;
  const allActive = activeCount === ROWS.length;

  return (
    <div className="h-full rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">
            System Security
          </h3>

          <p className="mt-1 text-xs text-ink-400">
            Live security component status
          </p>
        </div>

        <div
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            allActive
              ? "bg-status-verified/10 text-status-verified"
              : "bg-status-critical/10 text-status-critical"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              allActive
                ? "bg-status-verified"
                : "bg-status-critical"
            }`}
          />

          {activeCount}/{ROWS.length}
        </div>
      </div>

      {/* Security rows */}
      <ul className="mt-5 space-y-2">
        {ROWS.map((row) => {
          const active = Boolean(status?.[row.key]);
          const Icon = row.Icon;

          return (
            <li
              key={row.key}
              className={`rounded-lg border p-3 transition ${
                active
                  ? "border-status-verified/15 bg-status-verified/[0.03]"
                  : "border-status-critical/15 bg-status-critical/[0.025]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? "bg-status-verified/10 text-status-verified"
                      : "bg-status-critical/10 text-status-critical"
                  }`}
                >
                  <Icon size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800">
                    {row.label}
                  </p>

                  <p className="mt-0.5 truncate text-[11px] text-ink-400">
                    {row.description}
                  </p>
                </div>

                <div
                  className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                    active
                      ? "text-status-verified"
                      : "text-status-critical"
                  }`}
                >
                  {active ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <CircleAlert size={15} />
                  )}

                  <span className="hidden sm:inline">
                    {active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div
        className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
          allActive
            ? "border-status-verified/15 bg-status-verified/5 text-status-verified"
            : "border-status-critical/15 bg-status-critical/5 text-status-critical"
        }`}
      >
        {allActive ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>
              All security controls are operational.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              {activeCount === 0
                ? "Security status requires backend configuration."
                : `${ROWS.length - activeCount} security control${
                    ROWS.length - activeCount === 1 ? "" : "s"
                  } currently inactive.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}