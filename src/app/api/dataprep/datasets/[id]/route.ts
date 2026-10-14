// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// GET    /api/dataprep/datasets/[id] — fetch a single dataset's metadata,
//                                      cached profile, first 50 sample rows,
//                                      and applied-operations log.
// DELETE /api/dataprep/datasets/[id] — remove the Prisma record AND the
//                                      on-disk rows payload.
//
// GET response:    { meta: DatasetMeta, profile: Profile|null, sample: Row[], operations: Op[] }
// DELETE response: { ok: true, id }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Row, DatasetMeta, Profile } from "@/lib/dataprep";
import { loadDatasetRows, deleteDatasetRows } from "@/lib/dataprep-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Number of rows to include in the GET response sample. */
const SAMPLE_SIZE = 50;

/** Coerce a Prisma `Dataset` row into the public `DatasetMeta` shape. */
function toMeta(d: {
  id: string;
  name: string;
  filename: string;
  source: string;
  rowCount: number;
  colCount: number;
  qualityScore: number;
  createdAt: Date;
  updatedAt: Date;
  columns: unknown;
}): DatasetMeta {
  return {
    id: d.id,
    name: d.name,
    filename: d.filename,
    source: d.source,
    rowCount: d.rowCount,
    colCount: d.colCount,
    qualityScore: d.qualityScore,
    columns: Array.isArray(d.columns) ? d.columns : [],
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  } as unknown as DatasetMeta;
}

/**
 * GET /api/dataprep/datasets/[id]
 *
 * Fetch a single dataset by id. Returns the metadata, cached profile, first
 * `SAMPLE_SIZE` rows as a preview, and the applied-operations log.
 *
 * @returns 200 `{ meta, profile, sample, operations }`; 404 if not found; 500 on error.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const record = await db.dataset.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }
    const rows = loadDatasetRows(id);
    const sample: Row[] = Array.isArray(rows) ? rows.slice(0, SAMPLE_SIZE) : [];
    const operations = Array.isArray(record.operations) ? record.operations : [];
    const profile =
      record.profile != null ? (record.profile as unknown as Profile) : null;
    return NextResponse.json({
      meta: toMeta({
        id: record.id,
        name: record.name,
        filename: record.filename,
        source: record.source,
        rowCount: record.rowCount,
        colCount: record.colCount,
        qualityScore: record.qualityScore,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        columns: record.columns,
      }),
      profile,
      sample,
      operations,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dataprep/datasets/[id]
 *
 * Remove the dataset: delete the Prisma record and the on-disk rows file
 * (and evict the in-memory cache entry). Idempotent on the rows file: a
 * missing file is not an error.
 *
 * @returns 200 `{ ok: true, id }`; 404 if the Prisma record is missing; 500 on error.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    // Check existence first so we can return a clean 404.
    const existing = await db.dataset.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }
    await db.dataset.delete({ where: { id } });
    deleteDatasetRows(id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
