"use client";

import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Menu,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({
  onMenuClick,
}: TopbarProps) {
  const { user, setUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  function handleLogout() {
    setMenuOpen(false);
    setUser(null);
    router.push("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-white px-4 sm:px-6">
      {/* LEFT */}
      <div className="flex items-center gap-3">
        {/* Hamburger visible below 1024px */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition hover:bg-surface-muted lg:hidden"
        >
          <Menu size={22} />
        </button>

        {/* Brand shown on smaller screens */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-white">
            <span className="text-xs font-semibold">
              S
            </span>
          </div>

          <span className="text-sm font-semibold tracking-wide text-ink-900">
            SECURE DMS
          </span>
        </div>
      </div>

      {/* RIGHT */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">
            {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>

          <div className="hidden text-left leading-tight sm:block">
            <p className="max-w-[150px] truncate font-medium text-ink-900">
              {user?.name ?? "User"}
            </p>

            <p className="max-w-[150px] truncate text-xs text-ink-500">
              {user ? ROLE_LABELS[user.role] : ""}
            </p>
          </div>

          <ChevronDown
            size={14}
            className={`text-ink-400 transition-transform ${
              menuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close profile menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 h-full w-full cursor-default"
            />

            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
              <div className="border-b border-surface-border px-4 py-3">
                <p className="truncate text-sm font-medium text-ink-900">
                  {user?.name ?? "User"}
                </p>

                <p className="truncate text-xs text-ink-500">
                  {user ? ROLE_LABELS[user.role] : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-700 hover:bg-surface-muted"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}