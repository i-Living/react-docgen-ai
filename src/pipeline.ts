/**
 * @fileoverview Parallel file processing pipeline with progress bar
 */

import { CliOptions, FileResult } from "./types.js";
import { renderProgress, finalizeProgress } from "./progress.js";

/**
 * Single file handler.
 * Returns processing result.
 */
export type FileHandler = (file: string, index: number, total: number) => Promise<FileResult>;

/**
 * Processes a list of files with given concurrency.
 *
 * @param files - List of file paths
 * @param handler - Async handler for each file
 * @param opts - CLI options (for parallel, dryRun)
 * @param label - Label for progress bar
 * @returns Array of results
 */
export async function processFilesConcurrent(
  files: string[],
  handler: FileHandler,
  opts: CliOptions,
  label: string = "Processing",
): Promise<FileResult[]> {
  const total = files.length;
  if (total === 0) {
    if (!opts.quiet) console.log(`\n⚠️ No files to process (${label})`);
    return [];
  }

  const concurrency = Math.max(1, opts.parallel ?? 4);
  const results: FileResult[] = [];

  if (opts.dryRun) {
    if (!opts.quiet) console.log(`\n🧪 [DRY RUN] ${label}: ${total} files\n`);
    // In dry-run, just show what would happen
    for (const file of files) {
      if (!opts.quiet) console.log(`  ⏭️ Would process: ${file}`);
    }
    if (!opts.quiet) console.log(`\n🧪 Dry-run completed. ${total} files would be processed.`);
    return files.map((f) => ({ file: f, success: true, skipped: true, skipReason: "dry-run" }));
  }

  if (!opts.quiet) console.log(`\n📘 ${label}: ${total} files (concurrency: ${concurrency})`);
  if (!opts.quiet) renderProgress(0, total);

  // Split files into batches of concurrency size
  const batches: string[][] = [];
  for (let i = 0; i < total; i += concurrency) {
    batches.push(files.slice(i, i + concurrency));
  }

  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const skipReasons = new Map<string, number>();

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map((file, bi) => {
        const globalIdx = completed + bi;
        return handler(file, globalIdx, total);
      }),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
        if (r.value.success) {
          if (r.value.skipped) {
            skipped++;
            const reason = r.value.skipReason ?? "unknown";
            skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
          } else {
            succeeded++;
          }
        } else {
          failed++;
        }
      } else {
        results.push({
          file: "unknown",
          success: false,
          error: r.reason?.message ?? String(r.reason),
        });
        failed++;
      }
    }

    completed += batch.length;
    if (!opts.quiet) renderProgress(completed, total);
  }

  if (!opts.quiet) finalizeProgress();
  if (!opts.quiet) console.log(`\n✨ ${label} completed! ✅ ${succeeded} | ❌ ${failed} | ⏭️ ${skipped} skipped | 📁 ${total} total`);
  if (!opts.quiet && skipReasons.size > 0) {
    const reasonStr = [...skipReasons.entries()].map(([r, n]) => `${r}: ${n}`).join(", ");
    console.log(`   skip breakdown — ${reasonStr}`);
  }

  return results;
}
