/**
 * @fileoverview Параллельный пайплайн обработки файлов с прогресс-баром
 */

import { CliOptions, FileResult } from "./types.js";
import { renderProgress, finalizeProgress } from "./progress.js";

/**
 * Обработчик одного файла.
 * Возвращает результат обработки.
 */
export type FileHandler = (file: string, index: number, total: number) => Promise<FileResult>;

/**
 * Обрабатывает список файлов с заданной конкурентностью.
 *
 * @param files - Список путей к файлам
 * @param handler - Асинхронный обработчик каждого файла
 * @param opts - Опции CLI (для parallel, dryRun)
 * @param label - Метка для прогресс-бара
 * @returns Массив результатов
 */
export async function processFilesConcurrent(
  files: string[],
  handler: FileHandler,
  opts: CliOptions,
  label: string = "Processing",
): Promise<FileResult[]> {
  const total = files.length;
  if (total === 0) {
    console.log(`\n⚠️ Нет файлов для обработки (${label})`);
    return [];
  }

  const concurrency = Math.max(1, opts.parallel ?? 4);
  const results: FileResult[] = [];

  if (opts.dryRun) {
    console.log(`\n🧪 [DRY RUN] ${label}: ${total} files\n`);
    // В dry-run просто показываем что будет
    for (const file of files) {
      console.log(`  ⏭️ Would process: ${file}`);
    }
    console.log(`\n🧪 Dry-run completed. ${total} files would be processed.`);
    return files.map((f) => ({ file: f, success: true, skipped: true, skipReason: "dry-run" }));
  }

  console.log(`\n📘 ${label}: ${total} files (concurrency: ${concurrency})`);
  renderProgress(0, total);

  // Разбиваем файлы на батчи по concurrency штук
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
    renderProgress(completed, total);
  }

  finalizeProgress();
  console.log(`\n✨ ${label} completed! ✅ ${succeeded} | ❌ ${failed} | ⏭️ ${skipped} skipped | 📁 ${total} total`);
  if (skipReasons.size > 0) {
    const reasonStr = [...skipReasons.entries()].map(([r, n]) => `${r}: ${n}`).join(", ");
    console.log(`   skip breakdown — ${reasonStr}`);
  }

  return results;
}
