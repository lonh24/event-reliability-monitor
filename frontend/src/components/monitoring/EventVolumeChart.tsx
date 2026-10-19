import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EventVolumeBucketResponse } from "../../types/api";
import { utcTime } from "./presentation";

export default function EventVolumeChart({
  buckets,
}: {
  buckets: EventVolumeBucketResponse[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <AreaChart
        data={buckets}
        margin={{ top: 24, right: 12, bottom: 12, left: -20 }}
        accessibilityLayer
      >
        <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
        <XAxis
          dataKey="startAt"
          tickFormatter={(value: string) =>
            `${value.slice(5, 10)} ${value.slice(11, 16)}`
          }
          minTickGap={45}
          tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--bg-primary)",
            borderColor: "var(--control-border)",
            borderRadius: 8,
          }}
          labelFormatter={(label) => {
            const bucket = buckets.find((item) => item.startAt === label);
            return bucket
              ? `${utcTime(bucket.startAt)} → ${utcTime(bucket.endAt)}${bucket.partial ? " (partial window)" : ""}`
              : "UTC bucket";
          }}
          formatter={(value) => [value, "Observed events"]}
        />
        <Area
          name="Observed events"
          type="linear"
          dataKey="count"
          stroke="var(--brand-highlight)"
          fill="var(--brand-primary)"
          fillOpacity={0.13}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
