"use client";

import { useRouter } from "next/navigation";
import { Search, Bell, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";

export default function Topbar() {
  const { user, setUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  function handleLogout() {
    setUser(null);
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-surface-border bg-white px-6">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
        <input
          type="text"
          placeholder="Search cases / documents"
          className="w-full rounded-lg border border-surface-border bg-surface-muted py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-navy-600 focus:bg-white"
        />
      </div>

      <div className="flex items-center gap-4">
        <button aria-label="Notifications" className="relative rounded-full p-2 text-ink-500 hover:bg-surface-muted">
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-critical" />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="text-left leading-tight">
              <p className="font-medium text-ink-900">{user?.name ?? "User"}</p>
              <p className="text-xs text-ink-500">{user ? ROLE_LABELS[user.role] : ""}</p>
            </div>
            <ChevronDown size={14} className="text-ink-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-card border border-surface-border bg-white py-1 shadow-card">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-700 hover:bg-surface-muted"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
