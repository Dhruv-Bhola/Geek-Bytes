"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface ActivityPoint {
  day: string;
  uploads: number;
  views: number;
}

interface ActivityTrendChartProps {
  data: ActivityPoint[];
}

export default function ActivityTrendChart({
  data,
}: ActivityTrendChartProps) {
  const safeData = Array.isArray(data)
    ? data.map((item) => ({
        day: String(item?.day ?? ""),
        uploads: Number(item?.uploads ?? 0),
        views: Number(item?.views ?? 0),
      }))
    : [];

  if (safeData.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-muted/30">
        <p className="text-sm text-ink-400">
          No activity data available.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={safeData}
            margin={{
              top: 10,
              right: 8,
              left: -20,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient
                id="uploadsGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#2B5590"
                  stopOpacity={0.3}
                />

                <stop
                  offset="100%"
                  stopColor="#2B5590"
                  stopOpacity={0}
                />
              </linearGradient>

              <linearGradient
                id="viewsGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#0F8A4B"
                  stopOpacity={0.24}
                />

                <stop
                  offset="100%"
                  stopColor="#0F8A4B"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E1E5EB"
              vertical={false}
            />

            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 11,
                fill: "#667085",
              }}
              tickMargin={8}
              minTickGap={18}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 11,
                fill: "#667085",
              }}
              width={30}
              allowDecimals={false}
              domain={[0, "auto"]}
            />

            <Tooltip
              cursor={{
                stroke: "#CBD5E1",
                strokeDasharray: "4 4",
              }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E1E5EB",
                background: "#FFFFFF",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
              }}
              labelStyle={{
                color: "#344054",
                fontWeight: 600,
                marginBottom: 4,
              }}
              itemStyle={{
                padding: 0,
              }}
            />

            <Area
              type="monotone"
              dataKey="views"
              name="Views"
              stroke="#0F8A4B"
              strokeWidth={2}
              fill="url(#viewsGradient)"
              fillOpacity={1}
              activeDot={{
                r: 4,
              }}
              animationDuration={700}
            />

            <Area
              type="monotone"
              dataKey="uploads"
              name="Uploads"
              stroke="#2B5590"
              strokeWidth={2}
              fill="url(#uploadsGradient)"
              fillOpacity={1}
              activeDot={{
                r: 4,
              }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile-friendly legend */}
      <div className="mt-3 flex items-center justify-center gap-5 text-xs text-ink-500 sm:hidden">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-navy-700" />
          Uploads
        </span>

        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-status-verified" />
          Views
        </span>
      </div>
    </div>
  );
}