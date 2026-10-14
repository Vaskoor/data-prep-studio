// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// POST /api/dataprep/datasets/[id]/transform
//
// Apply a list of transforms (rename, drop, fill, derive, cast, sort, filter,
// pivot/unpivot, ...) to the stored rows. The new rows are persisted, the
// profile is recomputed, and the Prisma record's `operations` log is appended
// with this run.
//
// Request body: { ops: TransformOp[] }
// Response:      { profile: Profile, log: OpLog[], sample: Row[] }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  applyTransforms,
  profileDataset,
  type Row,
  type Profile,
  type TransformOp,
  type OpResult,
} from "@/lib/dataprep";
import { loadDatasetRows, saveDatasetRows } from "@/lib/dataprep-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Number of rows to include in the response sample. */
const SAMPLE_SIZE = 50;

/**
 * POST /api/dataprep/datasets/[id]/transform
 *
 * Body: `{ ops: TransformOp[] }`. Loads the current rows, applies the
 * transforms, persists the new rows, recomputes the profile, appends to the
 * `operations` log, and returns the new profile + log + sample.
 *
 * @returns 200 `{ profile, log, sample }`; 400 if `ops` is missing/invalid;
 *          404 if dataset or rows missing; 500 on error.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const record = await db.dataset.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const ops = (body as { ops?: unknown })?.ops;
    if (!Array.isArray(ops) || ops.length === 0) {
      return NextResponse.json(
        { error: "Body must be { ops: TransformOp[] } with at least one op" },
        { status: 400 }
      );
    }

    const rows = loadDatasetRows(id);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: `No rows on disk for dataset ${id}; cannot transform` },
        { status: 404 }
      );
    }

    // Apply the transforms. OpResult is treated as permissive (rows + log + optional columns).
    let result: OpResult & { rows?: Row[]; log?: unknown[]; columns?: unknown[] };
    try {
      result = applyTransforms(rows, ops as TransformOp[]) as typeof result;
    } catch (err) {
      return NextResponse.json(
        { error: `applyTransforms failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }

    const newRows = Array.isArray(result.rows) ? (result.rows as Row[]) : [];
    const log = Array.isArray(result.log) ? result.log : [];
    const newColumns = Array.isArray(result.columns) ? result.columns : record.columns;

    if (newRows.length === 0) {
      return NextResponse.json(
        {
          error: "Transform would remove all rows; refusing to persist. Adjust ops and retry.",
          log,
          sample: [],
        },
        { status: 400 }
      );
    }

    // Re-profile the transformed rows.
    let profile: Profile;
    try {
      profile = profileDataset(newRows, newColumns as never);
    } catch (err) {
      return NextResponse.json(
        { error: `Profile after transform failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }
    const qualityScore = Math.round((profile.quality?.overall ?? 0) * 100);

    // Append to the operations log.
    const priorOps = Array.isArray(record.operations) ? record.operations : [];
    const entry = {
      kind: "transform" as const,
      ops,
      appliedAt: new Date().toISOString(),
      summary: `Applied ${ops.length} transform op(s); ${newRows.length} rows remain.`,
    };
    const operations = [...priorOps, entry];

    // Persist: new rows on disk + updated metadata in Prisma.
    saveDatasetRows(id, newRows);
    await db.dataset.update({
      where: { id },
      data: {
        rowCount: newRows.length,
        colCount: Array.isArray(newColumns) ? newColumns.length : record.colCount,
        columns: newColumns as never,
        profile: profile as never,
        qualityScore,
        operations: operations as never,
      },
    });

    const sample = newRows.slice(0, SAMPLE_SIZE);
    return NextResponse.json({ profile, log, sample });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
