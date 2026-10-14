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
 * Data-quality scoring derived from a {@link Profile}.
 *
 * Scoring rubric (each component is 0..1, `overall` is a weighted mean rounded
 * to 2 decimals):
 *
 *  - `completeness` = 1 - (missingCells / totalCells)
 *      -> fraction of cells that are not missing.
 *
 *  - `uniqueness` = average(uniquePct) / 100 across columns
 *      -> average cardinality-ratio; high when columns have many distinct
 *         values (low duplication within a column).
 *
 *  - `consistency` = (colCount - textCols) / colCount
 *      -> fraction of columns whose inferred type is NOT "text" (text = the
 *         fallback when nothing else fits; low consistency => unstructured).
 *
 *  - `validity` = 1 - (duplicateRows / rowCount)
 *      -> parse-error proxy: exact-duplicate rows are treated as invalid.
 *
 *  - `overall` = 0.35 * completeness + 0.25 * uniqueness
 *                + 0.20 * consistency + 0.20 * validity   (rounded to 2dp)
 *
 * Empty dataset (rowCount==0 OR colCount==0) returns all zeros.
 */

import type { Profile, QualityScore } from "./types";

/** Round to 2 decimal places (deterministic, no float noise). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Compute the 5-axis quality score from a dataset profile. */
export function computeQuality(profile: Profile): QualityScore {
  const { rowCount, colCount, columns, missingCells, duplicateRows } = profile;
  const totalCells = rowCount * colCount;

  if (rowCount === 0 || colCount === 0) {
    return {
      completeness: 0,
      uniqueness: 0,
      consistency: 0,
      validity: 0,
      overall: 0,
    };
  }

  const completeness = 1 - missingCells / totalCells;

  const uniqueness =
    columns.length > 0
      ? columns.reduce((acc, c) => acc + (c.uniquePct ?? 0), 0) /
        columns.length /
        100
      : 0;

  const textCols = columns.filter((c) => c.type === "text").length;
  const consistency = (colCount - textCols) / colCount;

  const validity = 1 - duplicateRows / rowCount;

  const overall = round2(
    0.35 * completeness +
      0.25 * uniqueness +
      0.2 * consistency +
      0.2 * validity,
  );

  return {
    completeness: round2(completeness),
    uniqueness: round2(uniqueness),
    consistency: round2(consistency),
    validity: round2(validity),
    overall,
  };
}
