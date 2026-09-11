import { LucideIcon, Inbox, AlertOctagon, ShieldAlert } from "lucide-react";

type Kind = "empty" | "error" | "unauthorized";

const KIND_CONFIG: Record<Kind, { Icon: LucideIcon; defaultTitle: string }> = {
  empty: { Icon: Inbox, defaultTitle: "Nothing here yet" },
  error: { Icon: AlertOctagon, defaultTitle: "Something went wrong" },
  unauthorized: { Icon: ShieldAlert, defaultTitle: "You don't have access to this" },
};

export default function EmptyState({
  kind = "empty",
  title,
  description,
}: {
  kind?: Kind;
  title?: string;
  description?: string;
}) {
  const { Icon, defaultTitle } = KIND_CONFIG[kind];
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-surface-border bg-surface-card py-16 text-center">
      <Icon
        size={28}
        className={kind === "unauthorized" ? "text-status-critical" : kind === "error" ? "text-status-review" : "text-ink-400"}
      />
      <p className="font-medium text-ink-900">{title ?? defaultTitle}</p>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
    </div>
  );
}
