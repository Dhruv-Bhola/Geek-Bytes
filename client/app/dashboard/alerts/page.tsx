"use client";

import { useEffect, useState } from "react";
import { getAlerts } from "@/lib/api";
import type { SecurityAlert } from "@/lib/types";
import AlertCard from "@/components/AlertCard";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getAlerts().then(setAlerts).catch(() => setError(true));
  }, []);

  if (error) return <EmptyState kind="error" description="Could not load security alerts." />;
  if (!alerts) return <LoadingState label="Loading alerts…" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Security Alerts</h1>
        <p className="text-sm text-ink-500">Integrity failures and unauthorized access attempts.</p>
      </div>

      {alerts.length === 0 ? (
        <EmptyState kind="empty" description="No active security alerts." />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
