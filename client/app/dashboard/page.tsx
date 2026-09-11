"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  ListTree,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UploadCloud,
} from "lucide-react";

import { getDashboardSummary } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";

import StatCard from "@/components/StatCard";
import SecurityStatus from "@/components/SecurityStatus";
import ActivityTrendChart from "@/components/ActivityTrendChart";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";

const statGrid = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const AUTO_REFRESH_MS = 30_000;

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      }

      const data = await getDashboardSummary();

      setSummary(data);
      setError(false);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard loading failed:", err);
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    const interval = window.setInterval(() => {
      loadDashboard();
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const totalWeeklyUploads = useMemo(() => {
    return (summary?.weeklyActivity ?? []).reduce(
      (total, item) => total + Number(item.uploads || 0),
      0
    );
  }, [summary]);

  const totalWeeklyViews = useMemo(() => {
    return (summary?.weeklyActivity ?? []).reduce(
      (total, item) => total + Number(item.views || 0),
      0
    );
  }, [summary]);

  const recentActivity = summary?.recentActivity ?? [];

  if (error && !summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <EmptyState
          kind="error"
          description="Could not load the dashboard summary. Check the backend connection and try again."
        />
      </div>
    );
  }

  if (!summary) {
    return <LoadingState label="Loading dashboard…" />;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ============================================================
          HEADER
      ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">
              Dashboard
            </h1>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-verified/20 bg-status-verified/5 px-2.5 py-1 text-[11px] font-medium text-status-verified">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-verified opacity-50" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-verified" />
              </span>
              Live
            </span>
          </div>

          <p className="mt-1 text-sm text-ink-500">
            Overview of documents, cases and system security.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="hidden items-center gap-1.5 text-xs text-ink-400 sm:flex">
              <Clock3 size={13} />
              Updated {formatDateTime(lastUpdated.toISOString())}
            </span>
          )}

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-xs font-medium text-ink-700 shadow-card transition hover:border-navy-600 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </motion.div>

      {/* ============================================================
          STAT CARDS
      ============================================================ */}
      <motion.div
        variants={statGrid}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Documents"
          value={summary.totalDocuments}
          Icon={FileText}
        />

        <StatCard
          label="Active Cases"
          value={summary.activeCases}
          Icon={Briefcase}
        />

        <StatCard
          label="Security Alerts"
          value={summary.securityAlerts}
          Icon={Siren}
          tone="critical"
        />

        <StatCard
          label="Integrity Issues"
          value={summary.integrityIssues}
          Icon={ShieldAlert}
          tone="review"
        />
      </motion.div>

      {/* ============================================================
          MAIN MONITORING GRID
      ============================================================ */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* ----------------------------------------------------------
            ACTIVITY PANEL
        ---------------------------------------------------------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="min-w-0 rounded-card border border-surface-border bg-surface-card shadow-card xl:col-span-2"
        >
          {/* Panel header */}
          <div className="flex flex-col gap-3 border-b border-surface-border p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Activity size={16} className="text-navy-700" />
                Weekly Document Activity
              </h2>

              <p className="mt-1 text-xs text-ink-400">
                Document uploads and views recorded over the last 7 days.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-ink-500">
                <span className="h-2 w-2 rounded-full bg-navy-700" />
                Uploads
                <span className="font-semibold text-ink-800">
                  {totalWeeklyUploads}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-ink-500">
                <span className="h-2 w-2 rounded-full bg-status-verified" />
                Views
                <span className="font-semibold text-ink-800">
                  {totalWeeklyViews}
                </span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="p-4 sm:p-5">
            {summary.weeklyActivity.length > 0 ? (
              <ActivityTrendChart data={summary.weeklyActivity} />
            ) : (
              <EmptyChartState />
            )}
          </div>

          {/* Recent activity */}
          <div className="border-t border-surface-border">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Recent Document Activity
                </h3>

                <p className="mt-1 text-xs text-ink-400">
                  Latest recorded document events.
                </p>
              </div>

              <Link
                href="/dashboard/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 transition hover:text-navy-900"
              >
                View audit
                <ArrowRight size={13} />
              </Link>
            </div>

            {recentActivity.length > 0 ? (
              <ul className="divide-y divide-surface-border">
                {recentActivity.map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: 0.05 + index * 0.04,
                    }}
                    className="px-5 py-3.5 transition hover:bg-surface-muted/40"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                          <FileCheck2 size={15} />
                        </div>

                        <div className="min-w-0">
                          <p className="break-words text-sm leading-5 text-ink-700">
                            <span className="font-semibold text-ink-900">
                              {item.actor}
                            </span>{" "}
                            <span>{formatActivityAction(item.action)}</span>{" "}
                            <span className="font-medium text-ink-900">
                              {item.documentName}
                            </span>
                          </p>

                          <p className="mt-1 text-xs text-ink-400">
                            Document activity
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 pl-11 text-xs text-ink-400 sm:pl-0">
                        {formatDateTime(item.timestamp)}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <div className="px-5 pb-5">
                <EmptyActivityState />
              </div>
            )}
          </div>
        </motion.section>

        {/* ----------------------------------------------------------
            SECURITY STATUS
        ---------------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="min-w-0"
        >
          <SecurityStatus status={summary.systemSecurity} />
        </motion.div>
      </div>

      {/* ============================================================
          SECURITY SUMMARY STRIP
      ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card"
      >
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-ink-900">
            Security Overview
          </h2>
          <p className="mt-1 text-xs text-ink-400">
            Current operational state reported by the secure DMS backend.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SecurityMiniCard
            label="Encryption"
            active={summary.systemSecurity.encryption}
            Icon={ShieldCheck}
          />

          <SecurityMiniCard
            label="TEE Security"
            active={summary.systemSecurity.teeSecurity}
            Icon={ShieldCheck}
          />

          <SecurityMiniCard
            label="Blockchain"
            active={summary.systemSecurity.blockchainLedger}
            Icon={ListTree}
          />

          <SecurityMiniCard
            label="Integrity"
            active={summary.systemSecurity.integrityMonitoring}
            Icon={FileCheck2}
          />

          <SecurityMiniCard
            label="Access Control"
            active={summary.systemSecurity.accessControl}
            Icon={ShieldAlert}
          />
        </div>
      </motion.section>

      {/* ============================================================
          QUICK ACTIONS
      ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-ink-900">
            Quick Actions
          </h2>

          <p className="mt-1 text-xs text-ink-400">
            Access frequently used DMS operations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            href="/dashboard/cases"
            label="View Cases"
            description="Review assigned cases"
            Icon={Briefcase}
          />

          <QuickAction
            href="/dashboard/documents/upload"
            label="Upload Document"
            description="Securely add evidence"
            Icon={UploadCloud}
          />

          <QuickAction
            href="/dashboard/integrity"
            label="Verify Integrity"
            description="Check document hashes"
            Icon={ShieldCheck}
          />

          <QuickAction
            href="/dashboard/audit"
            label="Audit Ledger"
            description="Review recorded activity"
            Icon={ListTree}
          />
        </div>
      </motion.section>

      {/* ============================================================
          ERROR BANNER WHEN REFRESH FAILED BUT OLD DATA EXISTS
      ============================================================ */}
      {error && summary && (
        <div className="flex items-start gap-3 rounded-lg border border-status-critical/20 bg-status-critical/5 px-4 py-3 text-sm text-status-critical">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />

          <div>
            <p className="font-medium">Dashboard refresh failed</p>
            <p className="mt-0.5 text-xs opacity-80">
              Showing the last successfully loaded dashboard data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   HELPERS
   ========================================================================== */

function formatActivityAction(action: string) {
  const normalized = action
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "performed an action on";
  }

  const actionMap: Record<string, string> = {
    document_uploaded: "uploaded",
    document_viewed: "viewed",
    document_downloaded: "downloaded",
    document_verified: "verified",
    document_updated: "updated",
    document_transferred: "transferred",
    version_created: "created a new version of",
  };

  return actionMap[normalized] ?? normalized;
}

function EmptyChartState() {
  return (
    <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-muted/30 px-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <Activity size={19} />
      </div>

      <p className="text-sm font-medium text-ink-700">
        No document activity recorded
      </p>

      <p className="mt-1 max-w-sm text-xs text-ink-400">
        Uploads and document views from the last seven days will appear here.
      </p>
    </div>
  );
}

function EmptyActivityState() {
  return (
    <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted/30 px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink-700">
        No recent document activity
      </p>

      <p className="mt-1 text-xs text-ink-400">
        New document events will appear here automatically.
      </p>
    </div>
  );
}

function SecurityMiniCard({
  label,
  active,
  Icon,
}: {
  label: string;
  active: boolean;
  Icon: typeof ShieldCheck;
}) {
  return (
    <div
      className={`rounded-lg border p-3.5 ${
        active
          ? "border-status-verified/20 bg-status-verified/5"
          : "border-status-critical/20 bg-status-critical/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            size={16}
            className={
              active ? "text-status-verified" : "text-status-critical"
            }
          />

          <span className="truncate text-xs font-medium text-ink-700">
            {label}
          </span>
        </div>

        {active ? (
          <CheckCircle2
            size={15}
            className="shrink-0 text-status-verified"
          />
        ) : (
          <AlertTriangle
            size={15}
            className="shrink-0 text-status-critical"
          />
        )}
      </div>

      <p
        className={`mt-2 text-[11px] font-medium ${
          active ? "text-status-verified" : "text-status-critical"
        }`}
      >
        {active ? "Operational" : "Inactive"}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  label,
  description,
  Icon,
}: {
  href: string;
  label: string;
  description: string;
  Icon: typeof Briefcase;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-navy-600 hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 transition group-hover:bg-navy-100">
        <Icon size={18} />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">{label}</p>

        <p className="mt-0.5 text-xs text-ink-400">{description}</p>
      </div>

      <ArrowRight
        size={15}
        className="ml-auto shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-navy-700"
      />
    </Link>
  );
}