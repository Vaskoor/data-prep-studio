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
 * Transform operations: normalize, standardize, onehot_encode, label_encode,
 * bin_equal_width, bin_equal_freq, date_parts, text_length.
 *
 * Pure functions: input rows are deep-cloned before mutation.  Each op
 * appends new columns (e.g. `<col>_norm`) rather than overwriting the
 * original, so the source column is preserved for auditability.
 */

import { numericStats } from "./stats";
import type { Cell, OpResult, Row, TransformOp } from "./types";

/** Coerce a cell to a number; null if not numeric. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!isNaN(n) && isFinite(n)) return n;
  }
  return null;
}

/** Linear-interpolation quantile on a SORTED array (numpy-style). */
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

/** Shallow-per-row deep clone (cells are primitives). */
function deepClone(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r }));
}

/** Format a number for bin labels (2-decimal, trim trailing zeros). */
function fmt(n: number): string {
  if (!isFinite(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

/** Apply a sequence of transform operations in order, accumulating a log. */
export function applyTransforms(rows: Row[], ops: TransformOp[]): OpResult {
  let current = deepClone(rows);
  const log: OpResult["log"] = [];

  for (const op of ops) {
    let affected = 0;
    let message = "";
    const col = op.column;

    switch (op.type) {
      case "normalize": {
        if (!col) break;
        const nums: number[] = [];
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) nums.push(n);
        }
        const stats = numericStats(nums);
        const range = stats.max - stats.min || 1;
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) {
            r[`${col}_norm`] = (n - stats.min) / range;
            affected++;
          } else {
            r[`${col}_norm`] = null;
          }
        }
        message = `Normalized '${col}' -> '${col}_norm' (${affected} values, range=[${stats.min}, ${stats.max}])`;
        break;
      }

      case "standardize": {
        if (!col) break;
        const nums: number[] = [];
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) nums.push(n);
        }
        const stats = numericStats(nums);
        const std = stats.std || 1;
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) {
            r[`${col}_zscore`] = (n - stats.mean) / std;
            affected++;
          } else {
            r[`${col}_zscore`] = null;
          }
        }
        message = `Standardized '${col}' -> '${col}_zscore' (${affected} values, mean=${stats.mean}, std=${stats.std})`;
        break;
      }

      case "onehot_encode": {
        if (!col) break;
        const distinct = new Set<string>();
        for (const r of current) {
          const v = r[col];
          if (v !== null && v !== undefined) distinct.add(String(v));
        }
        const cats = [...distinct].sort();
        for (const r of current) {
          const v = r[col];
          const key = v === null || v === undefined ? null : String(v);
          for (const c of cats) {
            r[`${col}_${c}`] = key === c;
          }
          affected++;
        }
        message = `One-hot encoded '${col}' into ${cats.length} columns (${cats.slice(0, 3).join(", ")}${cats.length > 3 ? ", ..." : ""})`;
        break;
      }

      case "label_encode": {
        if (!col) break;
        const distinct = new Set<string>();
        for (const r of current) {
          const v = r[col];
          if (v !== null && v !== undefined) distinct.add(String(v));
        }
        const cats = [...distinct].sort();
        const map = new Map<string, number>();
        cats.forEach((c, i) => map.set(c, i));
        for (const r of current) {
          const v = r[col];
          if (v === null || v === undefined) {
            r[`${col}_code`] = null;
          } else {
            r[`${col}_code`] = map.get(String(v)) ?? null;
            affected++;
          }
        }
        message = `Label-encoded '${col}' -> '${col}_code' (${cats.length} categories)`;
        break;
      }

      case "bin_equal_width": {
        if (!col) break;
        const bins =
          typeof op.params?.bins === "number" && op.params.bins > 0
            ? Math.max(1, Math.floor(op.params.bins))
            : 5;
        const nums: number[] = [];
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) nums.push(n);
        }
        const stats = numericStats(nums);
        const width = (stats.max - stats.min) / bins || 1;
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n === null) {
            r[`${col}_bin`] = null;
            continue;
          }
          let idx = Math.floor((n - stats.min) / width);
          if (idx >= bins) idx = bins - 1;
          if (idx < 0) idx = 0;
          const lo = stats.min + idx * width;
          const hi = lo + width;
          r[`${col}_bin`] = `[${fmt(lo)}-${fmt(hi)})`;
          affected++;
        }
        message = `Binned '${col}' (equal-width, ${bins} bins) -> '${col}_bin'`;
        break;
      }

      case "bin_equal_freq": {
        if (!col) break;
        const bins =
          typeof op.params?.bins === "number" && op.params.bins > 0
            ? Math.max(1, Math.floor(op.params.bins))
            : 5;
        const nums: number[] = [];
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) nums.push(n);
        }
        const sorted = [...nums].sort((a, b) => a - b);
        const edges: number[] = [];
        for (let i = 0; i <= bins; i++) {
          edges.push(quantileSorted(sorted, i / bins));
        }
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n === null) {
            r[`${col}_bin`] = null;
            continue;
          }
          // Place into the first bin whose upper edge is >= n.
          let idx = bins - 1;
          for (let i = 0; i < bins; i++) {
            if (n <= edges[i + 1]) {
              idx = i;
              break;
            }
          }
          const lo = edges[idx];
          const hi = edges[idx + 1];
          r[`${col}_bin`] = `[${fmt(lo)}-${fmt(hi)})`;
          affected++;
        }
        message = `Binned '${col}' (equal-freq, ${bins} bins) -> '${col}_bin'`;
        break;
      }

      case "date_parts": {
        if (!col) break;
        for (const r of current) {
          const v = r[col];
          let d: Date | null = null;
          if (typeof v === "string") {
            const dv = new Date(v.trim());
            if (!isNaN(dv.getTime())) d = dv;
          } else if (typeof v === "number") {
            // Treat numbers as ms-since-epoch.
            const dv = new Date(v);
            if (!isNaN(dv.getTime())) d = dv;
          }
          if (d) {
            r[`${col}_year`] = d.getFullYear();
            r[`${col}_month`] = d.getMonth() + 1;
            r[`${col}_day`] = d.getDate();
            r[`${col}_hour`] = d.getHours();
            affected++;
          } else {
            r[`${col}_year`] = null;
            r[`${col}_month`] = null;
            r[`${col}_day`] = null;
            r[`${col}_hour`] = null;
          }
        }
        message = `Extracted date parts from '${col}' (${affected} rows)`;
        break;
      }

      case "text_length": {
        if (!col) break;
        for (const r of current) {
          const v = r[col];
          if (v === null || v === undefined) {
            r[`${col}_len`] = null;
          } else {
            r[`${col}_len`] = String(v).length;
            affected++;
          }
        }
        message = `Computed text length of '${col}' -> '${col}_len' (${affected} rows)`;
        break;
      }

      default:
        message = `Unknown transform op: ${op.type}`;
    }

    log.push({ op: op.type, affected, message });
  }

  return { rows: current, log };
}
