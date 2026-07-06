'use client';

import {
  LineChart, Line, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Props {
  data: number[];
  color: string;
}

export function RatioSparkline({ data, color }: Props) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={points}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        {/* 100 % line at 10 000 bps */}
        <ReferenceLine y={10_000} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const val = payload[0].value as number;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
                {(val / 100).toFixed(1)}%
              </div>
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
