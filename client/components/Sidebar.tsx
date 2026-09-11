"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = visibleNavItems(user?.role);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-border bg-navy-950 text-white md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <ShieldHalf size={22} />
        <span className="text-sm font-semibold tracking-wide">SECURE DMS</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.label] ?? LayoutDashboard;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "text-white" : "text-white/70 hover:bg-navy-800 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-lg bg-navy-700"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={17} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-white/50">
        Authorized personnel only
      </div>
    </aside>
  );
}
