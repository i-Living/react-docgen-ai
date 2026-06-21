/**
 * @fileoverview Simple progress bar for CLI
 */

/** Progress bar width in characters */
const BAR_WIDTH = 30;

/**
 * Draws progress bar in terminal (single line, overwritten).
 * @param current - Current processed count
 * @param total - Total count
 * @param label - Text label (optional)
 */
export function renderProgress(current: number, total: number, label?: string): void {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.round((BAR_WIDTH * current) / Math.max(total, 1));
  const empty = BAR_WIDTH - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pct = String(percent).padStart(3);
  const idx = String(current).padStart(String(total).length);

  const line = `  ${bar} ${pct}% [${idx}/${total}]${label ? `  ${label}` : ""}`;
  process.stdout.write(`\r${line}`);
}

/**
 * Finalizes progress bar line (moves to new line).
 */
export function finalizeProgress(): void {
  process.stdout.write("\n");
}
