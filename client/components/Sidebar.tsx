"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  UploadCloud,
  History,
  ShieldCheck,
  ListTree,
  Siren,
  KeyRound,
  Users,
  Settings,
  ShieldHalf,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { visibleNavItems } from "@/lib/permissions";

const ICONS: Record<string, typeof LayoutDashboard> = {
  Dashboard: LayoutDashboard,
  Cases: Briefcase,
  Documents: FileText,
  Upload: UploadCloud,
  "Chain of Custody": History,
  Integrity: ShieldCheck,
  "Audit Ledger": ListTree,
  "Security Alerts": Siren,
  "Emergency Access": KeyRound,
  Administration: Users,
  Settings: Settings,
};

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const items = visibleNavItems(user?.role);

  const navigation = (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.label] ?? LayoutDashboard;

          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? "text-white"
                  : "text-white/70 hover:bg-navy-800 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-lg bg-navy-700"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                  }}
                />
              )}

              <span className="relative z-10 flex items-center gap-3">
                <Icon size={17} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-2">
          <ShieldHalf size={22} />
          <span className="text-sm font-semibold tracking-wide">
            SECURE DMS
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={20} />
        </button>
      </div>

      {navigation}

      <div className="shrink-0 border-t border-white/10 px-5 py-4 text-xs text-white/50">
        Authorized personnel only
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 bg-navy-950 text-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile/tablet drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.button
              type="button"
              aria-label="Close navigation overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 z-[90] cursor-default bg-black/50 lg:hidden"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 32,
              }}
              className="fixed inset-y-0 left-0 z-[100] w-72 max-w-[85vw] bg-navy-950 text-white shadow-2xl lg:hidden"
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}