"use client";

import { useMemo } from "react";
import { formatBillions } from "@/lib/format";

const TEAL = [0x28, 0x5e, 0x61];
const TEAL_LIGHT = [0xe6, 0xff, 0xfa];
const RED = [0xdc, 0x26, 0x26];
const RED_LIGHT = [0xfe, 0xe2, 0xe2];

function mix(a, b, t) {
  return `rgb(${a.map((channel, i) => Math.round(channel + (b[i] - channel) * t)).join(",")})`;
}

function cellColor(value, extent) {
  if (value >= 0) {
    return mix(TEAL_LIGHT, TEAL, Math.min(1, value / extent));
  }

  return mix(RED_LIGHT, RED, Math.min(1, -value / extent));
}

export default function Heatmap({
  evaluate,
  xs,
  ys,
  marks = [],
  xLabel,
  yLabel,
  formatX,
  formatY,
  extent: sharedExtent,
  cellW = 40,
  cellH = 18,
  ariaLabel,
}) {
  const shares = xs;
  const yields = ys;
  const grid = useMemo(
    () => ys.map((y) => xs.map((x) => evaluate(x, y))),
    [evaluate, xs, ys]
  );
  const extent =
    sharedExtent ?? Math.max(1, ...grid.flat().map((value) => Math.abs(value)));
  const left = 64;
  const top = 28;
  const width = left + shares.length * cellW + 16;
  const height = top + yields.length * cellH + 44;
  const x = (share) => left + ((share - shares[0]) / (shares.at(-1) - shares[0])) * (shares.length - 1) * cellW + cellW / 2;
  const y = (yieldRate) => top + ((yieldRate - yields[0]) / (yields.at(-1) - yields[0])) * (yields.length - 1) * cellH + cellH / 2;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="max-w-full"
      >
        {grid.map((row, rowIndex) =>
          row.map((value, columnIndex) => (
            <rect
              key={`${rowIndex}-${columnIndex}`}
              x={left + columnIndex * cellW}
              y={top + rowIndex * cellH}
              width={cellW}
              height={cellH}
              fill={cellColor(value, extent)}
            >
              <title>
                {`${formatX(shares[columnIndex])}, ${formatY(yields[rowIndex])}: ${formatBillions(value, { showPlus: true })}`}
              </title>
            </rect>
          ))
        )}
        {shares.map((share, index) =>
          index % 2 === 0 ? (
            <text
              key={share}
              x={left + index * cellW + cellW / 2}
              y={top + yields.length * cellH + 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--gray-500)"
            >
              {formatX(share)}
            </text>
          ) : null
        )}
        {yields.map((yieldRate, index) =>
          index % 2 === 0 ? (
            <text
              key={yieldRate}
              x={left - 8}
              y={top + index * cellH + cellH / 2 + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--gray-500)"
            >
              {formatY(yieldRate)}
            </text>
          ) : null
        )}
        <text x={left + (shares.length * cellW) / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--gray-600)">
          {xLabel}
        </text>
        <text
          x={14}
          y={top + (yields.length * cellH) / 2}
          textAnchor="middle"
          fontSize="11"
          fill="var(--gray-600)"
          transform={`rotate(-90 14 ${top + (yields.length * cellH) / 2})`}
        >
          {yLabel}
        </text>
        {marks.map((mark) => (
          <g key={mark.label}>
            <circle cx={x(mark.x)} cy={y(mark.y)} r={6} fill="white" stroke="var(--gray-800)" strokeWidth={2} />
            <text x={x(mark.x) + 10} y={y(mark.y) + 4} fontSize="11" fontWeight="600" fill="var(--gray-800)">
              {mark.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
