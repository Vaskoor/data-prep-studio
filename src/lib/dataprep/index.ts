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
 * Barrel export for the Data Prep Studio data-prep library.
 *
 * Importable from API routes AND client components:
 *
 * ```ts
 * import { parseCSV, profileDataset, applyCleaning, applyTransforms } from "@/lib/dataprep";
 * ```
 */

export * from "./types";
export * from "./stats";
export * from "./parse";
export * from "./profile";
export * from "./clean";
export * from "./transform";
export * from "./quality";
