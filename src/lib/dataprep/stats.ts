// MIT License
// Copyright (c) 2025 Data Prep Studio
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

/**
 * Pure-TypeScript numeric statistics.
 *
 * No external dependencies.  All functions are pure (input is never mutated)
 * and deterministic (no Math.random, no Date.now).
 */

import type { HistogramBin, NumericStats } from "./types";

/**
 * Format a number compactly for histogram bin labels.
 * Trims trailing zeros while keeping at most 2 decimals.
 */
function formatNum(n: number): string {
  if (!isFinite(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/**
 * Compute a quantile (0..1) from a SORTED array using linear interpolation
 * (the same method used by numpy's default "linear" quantile).
 */
function quantileSorted(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Compute summary statistics for an array of numbers.
 *
 * - min / max / mean / median / std (sample stddev, n-1) / q1 / q3 / iqr
 * - histogram: 10 equal-width bins labelled like "0–10"
 * - outliers: count of values outside [q1 - 1.5*iqr, q3 + 1.5*iqr]
 *
 * Empty / all-NaN input returns a zero-valued stats object (no throw).
 */
export function numericStats(values: number[]): NumericStats {
  const empty: NumericStats = {
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    std: 0,
    q1: 0,
    q3: 0,
    iqr: 0,
    histogram: [],
    outliers: 0,
  };
  if (!Array.isArray(values) || values.length === 0) return empty;

  // Keep only finite numbers (drop NaN/Infinity).
  const clean = values.filter(
    (v): v is number => typeof v === "number" && !isNaN(v) && isFinite(v),
  );
  if (clean.length === 0) return empty;

  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const median = quantileSorted(sorted, 0.5);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;

  // Sample stddev (n-1); 0 when n == 1 to avoid divide-by-zero.
  const variance =
    n > 1
      ? sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const std = Math.sqrt(variance);

  // IQR outlier rule.
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const outliers = clean.filter((v) => v < lowFence || v > highFence).length;

  // Histogram: 10 equal-width bins (single bin if min == max).
  const histogram: HistogramBin[] = [];
  if (min === max) {
    histogram.push({ bin: formatNum(min), count: n });
  } else {
    const width = (max - min) / 10;
    for (let i = 0; i < 10; i++) {
      const lo = min + i * width;
      const hi = min + (i + 1) * width;
      histogram.push({ bin: `${formatNum(lo)}–${formatNum(hi)}`, count: 0 });
    }
    for (const v of clean) {
      let idx = Math.floor((v - min) / width);
      if (idx >= 10) idx = 9;
      if (idx < 0) idx = 0;
      histogram[idx].count++;
    }
  }

  return { min, max, mean, median, std, q1, q3, iqr, histogram, outliers };
}
