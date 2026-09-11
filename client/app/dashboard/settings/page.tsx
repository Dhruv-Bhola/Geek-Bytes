"use client";

import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500">Profile, multi-factor authentication and active sessions.</p>
      </div>

      <section className="rounded-card border border-surface-border bg-surface-card p-6 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Profile</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Name" value={user?.name ?? "—"} />
          <Row label="Employee ID" value={user?.employeeId ?? "—"} />
          <Row label="Department" value={user?.department ?? "—"} />
          <Row label="Role" value={user ? ROLE_LABELS[user.role] : "—"} />
        </dl>
      </section>

      <section className="rounded-card border border-surface-border bg-surface-card p-6 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Multi-Factor Authentication</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-700">MFA is required for every login.</span>
          <span className="rounded-full bg-status-verifiedBg px-2.5 py-1 text-xs font-medium text-status-verified">Enabled</span>
        </div>
      </section>

      <section className="rounded-card border border-surface-border bg-surface-card p-6 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Active Sessions</h2>
        <p className="text-sm text-ink-500">
          Session policy (expiry, automatic logout) is controlled by the backend, not this screen — see spec section 17.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-surface-border pb-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}
