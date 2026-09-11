"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";

export default function StatCard({
  label,
  value,
  Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  tone?: "default" | "critical" | "review";
}) {
  const numeric = typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);

  const iconBg =
    tone === "critical" ? "bg-status-criticalBg text-status-critical" :
    tone === "review" ? "bg-status-reviewBg text-status-review" :
    "bg-status-infoBg text-status-info";

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-ink-900">
            {numeric ? animated : value}
          </p>
          <p className="mt-1 text-sm text-ink-500">{label}</p>
        </div>
        <div className={`rounded-lg p-2 ${iconBg}`}>
          <Icon size={18} />
        </div>
      </div>
    </motion.div>
  );
}
