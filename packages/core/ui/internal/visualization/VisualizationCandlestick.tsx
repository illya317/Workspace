"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { VisualizationCandlestickSpec } from "../../VisualizationSurfaceTypes";
import { EmptyStateCard } from "../common/Card";
import {
  calculateSimpleMovingAverage,
  candlestickPriceRange,
  candlestickVolumeMax,
  normalizeCandlestickPoints,
} from "./VisualizationCandlestickMath";

const AVERAGE_STYLES = [
  { stroke: "stroke-blue-500", text: "text-blue-600" },
  { stroke: "stroke-amber-500", text: "text-amber-600" },
  { stroke: "stroke-rose-400", text: "text-rose-500" },
  { stroke: "stroke-emerald-500", text: "text-emerald-600" },
] as const;

export default function VisualizationCandlestick({ visual }: { visual: VisualizationCandlestickSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const points = useMemo(() => normalizeCandlestickPoints(visual.points), [visual.points]);
  const periods = useMemo(() => Array.from(new Set(visual.movingAveragePeriods ?? [5, 10, 20, 30]))
    .filter((period) => Number.isInteger(period) && period > 1)
    .slice(0, AVERAGE_STYLES.length), [visual.movingAveragePeriods]);
  const averages = useMemo(() => periods.map((period) => ({
    period,
    values: calculateSimpleMovingAverage(points.map((point) => point.close), period),
  })), [periods, points]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setWidth(Math.max(container.clientWidth, 320));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return <EmptyStateCard compact>{visual.emptyText ?? "暂无 K 线数据"}</EmptyStateCard>;

  const height = Math.max(300, visual.height ?? 390);
  const left = width < 480 ? 46 : 58;
  const right = 14;
  const top = 20;
  const priceBottom = Math.round(height * 0.69);
  const volumeTop = priceBottom + 34;
  const volumeBottom = height - 26;
  const plotWidth = Math.max(width - left - right, 1);
  const step = plotWidth / points.length;
  const candleWidth = Math.max(2, Math.min(10, step * 0.58));
  const priceRange = candlestickPriceRange(points);
  const volumeMax = candlestickVolumeMax(points);
  const activeIndex = Math.min(hoveredIndex ?? points.length - 1, points.length - 1);
  const active = points[activeIndex]!;
  const xFor = (index: number) => left + step * (index + 0.5);
  const yFor = (value: number) => top + (priceRange.max - value) / (priceRange.max - priceRange.min) * (priceBottom - top);
  const priceTicks = Array.from({ length: 5 }, (_, index) => priceRange.max - (priceRange.max - priceRange.min) * index / 4);
  const labelIndexes = Array.from(new Set([0, Math.round((points.length - 1) / 2), points.length - 1]));
  const redUp = (visual.directionConvention ?? "red-up") === "red-up";

  function directionClass(open: number, close: number, slot: "stroke" | "fill") {
    if (close === open) return slot === "stroke" ? "stroke-slate-400" : "fill-slate-400";
    const positive = close > open;
    const rose = positive ? redUp : !redUp;
    if (slot === "stroke") return rose ? "stroke-rose-500" : "stroke-emerald-500";
    return rose ? "fill-rose-500" : "fill-emerald-500";
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const index = Math.floor((pointerX - left) / step);
    if (index >= 0 && index < points.length) setHoveredIndex(index);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    setHoveredIndex((current) => Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + delta)));
  }

  return (
    <div ref={containerRef} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{active.label}</span>
        <span>开 {formatPrice(active.open)}</span>
        <span>高 {formatPrice(active.high)}</span>
        <span>低 {formatPrice(active.low)}</span>
        <span>收 {formatPrice(active.close)}</span>
        <span>{visual.volumeLabel ?? "成交量"} {formatCompact(active.volume)}</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {averages.map((average, index) => (
          <span key={average.period} className={AVERAGE_STYLES[index]!.text}>
            MA{average.period} {formatPrice(average.values[activeIndex])}
          </span>
        ))}
      </div>
      <svg
        aria-label="日 K 线图，可使用左右方向键查看交易日"
        className="block w-full rounded-lg border border-slate-200 bg-slate-50/40 outline-none focus:ring-2 focus:ring-blue-300"
        height={height}
        onBlur={() => setHoveredIndex(null)}
        onFocus={() => setHoveredIndex(points.length - 1)}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHoveredIndex(null)}
        onPointerMove={onPointerMove}
        role="img"
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>日 K 线、移动均线与成交量</title>
        {priceTicks.map((tick) => {
          const y = yFor(tick);
          return <g key={tick}>
            <line className="stroke-slate-200" strokeDasharray="3 4" x1={left} x2={width - right} y1={y} y2={y} />
            <text className="fill-slate-400 text-[10px]" dominantBaseline="middle" textAnchor="end" x={left - 7} y={y}>{formatPrice(tick)}</text>
          </g>;
        })}
        <line className="stroke-slate-200" x1={left} x2={width - right} y1={volumeTop} y2={volumeTop} />
        {points.map((point, index) => {
          const x = xFor(index);
          const openY = yFor(point.open);
          const closeY = yFor(point.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(openY - closeY), 1.5);
          const volumeHeight = (point.volume ?? 0) / volumeMax * Math.max(volumeBottom - volumeTop, 1);
          return <g key={point.key}>
            <line className={directionClass(point.open, point.close, "stroke")} strokeWidth={1.2} x1={x} x2={x} y1={yFor(point.high)} y2={yFor(point.low)} />
            <rect className={directionClass(point.open, point.close, "fill")} height={bodyHeight} width={candleWidth} x={x - candleWidth / 2} y={bodyTop} />
            <rect className={directionClass(point.open, point.close, "fill")} height={volumeHeight} opacity={0.72} width={candleWidth} x={x - candleWidth / 2} y={volumeBottom - volumeHeight} />
          </g>;
        })}
        {averages.map((average, index) => (
          <path key={average.period} className={AVERAGE_STYLES[index]!.stroke} d={movingAveragePath(average.values, xFor, yFor)} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65} />
        ))}
        <line className="stroke-slate-400" strokeDasharray="4 3" x1={xFor(activeIndex)} x2={xFor(activeIndex)} y1={top} y2={volumeBottom} />
        <circle className="fill-slate-700" cx={xFor(activeIndex)} cy={yFor(active.close)} r={2.5} />
        {labelIndexes.map((index) => (
          <text key={points[index]!.key} className="fill-slate-400 text-[10px]" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} x={index === 0 ? left : index === points.length - 1 ? width - right : xFor(index)} y={height - 8}>{points[index]!.label}</text>
        ))}
      </svg>
    </div>
  );
}

function movingAveragePath(values: readonly (number | null)[], xFor: (index: number) => number, yFor: (value: number) => number) {
  let drawing = false;
  return values.map((value, index) => {
    if (value === null) { drawing = false; return ""; }
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`;
  }).filter(Boolean).join(" ");
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: Math.abs(value) < 10 ? 4 : 2 }).format(value);
}

function formatCompact(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
