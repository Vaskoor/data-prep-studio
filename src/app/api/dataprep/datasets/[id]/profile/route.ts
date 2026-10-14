// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// POST /api/dataprep/datasets/[id]/profile
//
// Re-compute the dataset's Profile from the current on-disk rows, update the
// cached `profile` + `qualityScore` on the Prisma record, and return the new
// Profile. Useful after manual edits or external mutations to refresh the
// cached stats shown in the UI.
//
// Request body: optional `{}` — no parameters.
// Response: { profile: Profile }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profileDataset, type Profile } from "@/lib/dataprep";
import { loadDatasetRows } from "@/lib/dataprep-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dataprep/datasets/[id]/profile
 *
 * Re-profile the dataset from its stored rows, persist the new Profile +
 * qualityScore, and return the new Profile.
 *
 * @returns 200 `{ profile }`; 404 if dataset or rows missing; 500 on error.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const record = await db.dataset.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }

    const rows = loadDatasetRows(id);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: `No rows on disk for dataset ${id}; cannot profile` },
        { status: 404 }
      );
    }

    const columns = Array.isArray(record.columns) ? record.columns : [];
    let profile: Profile;
    try {
      profile = profileDataset(rows, columns as never);
    } catch (err) {
      return NextResponse.json(
        { error: `Profile failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }

    const qualityScore = Math.round((profile.quality?.overall ?? 0) * 100);

    await db.dataset.update({
      where: { id },
      data: {
        profile: profile as never,
        qualityScore,
        rowCount: rows.length,
      },
    });

    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
