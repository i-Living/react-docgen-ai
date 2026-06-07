/**
 * @fileoverview Простой прогресс-бар для CLI
 */

/** Ширина прогресс-бара в символах */
const BAR_WIDTH = 30;

/**
 * Рисует прогресс-бар в терминале (одна строка, перезаписывается).
 * @param current - Текущее количество обработанных
 * @param total - Общее количество
 * @param label - Текстовая метка (опционально)
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
 * Завершает строку прогресс-бара (переводит на новую строку).
 */
export function finalizeProgress(): void {
  process.stdout.write("\n");
}
