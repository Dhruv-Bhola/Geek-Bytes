import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export type BadgeTone = "verified" | "review" | "critical" | "info";

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string; Icon: typeof CheckCircle2 }> = {
  verified: { bg: "bg-status-verifiedBg", text: "text-status-verified", Icon: CheckCircle2 },
  review: { bg: "bg-status-reviewBg", text: "text-status-review", Icon: AlertTriangle },
  critical: { bg: "bg-status-criticalBg", text: "text-status-critical", Icon: XCircle },
  info: { bg: "bg-status-infoBg", text: "text-status-info", Icon: Info },
};

/**
 * Always pairs an icon with the color so status is never communicated by
 * color alone (spec section 3, UX rules).
 */
export default function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const { bg, text, Icon } = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bg} ${text}`}
    >
      <Icon size={14} strokeWidth={2} />
      {label}
    </span>
  );
}
