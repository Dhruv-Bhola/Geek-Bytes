import type { CustodyEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export default function CustodyTimeline({ events }: { events: CustodyEvent[] }) {
  return (
    <ol className="relative border-l border-surface-border pl-6">
      {events.map((event, i) => (
        <li key={event.id} className="mb-8 last:mb-0">
          <span className="absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 border-navy-700 bg-white" />
          <p className="text-xs text-ink-400">{formatDateTime(event.timestamp)}</p>
          <p className="mt-0.5 font-medium text-ink-900">{event.actor}</p>
          <p className="text-sm text-ink-700">
            {event.action}
            {event.hash && <span className="text-ink-500"> — Hash {event.hash}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}
