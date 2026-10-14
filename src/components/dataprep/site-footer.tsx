// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
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

import { Database, Heart, ShieldCheck } from "lucide-react";

/**
 * SiteFooter — sticky bottom footer for Data Prep Studio.
 *
 * Designed to live inside a `min-h-screen flex flex-col` root so it sits at the
 * bottom via `mt-auto`. Slate-900 background, emerald gradient logo square.
 *
 * @returns A React `<footer>` element.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
              <Database className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">
                Data Prep Studio
              </div>
              <div className="text-[11px] text-slate-400">
                Profile, clean, transform, and export CSV / JSON datasets — locally
                in your browser.
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-[11px] text-slate-400 sm:flex-row sm:gap-4">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              No data leaves your session
            </span>
            <span className="flex items-center gap-1.5">
              Built with
              <Heart
                className="h-3 w-3 fill-rose-400 text-rose-400"
                aria-hidden="true"
              />
              on Next.js · shadcn/ui · recharts
            </span>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center text-[11px] text-slate-500 sm:text-left">
          © {new Date().getFullYear()} Data Prep Studio · MIT License
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
