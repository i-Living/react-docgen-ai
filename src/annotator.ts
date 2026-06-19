/**
 * @fileoverview Модуль для автоматического добавления комментариев в React код
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile, writeOutput, writeInPlace, hasFileoverview, removeComments, hasCodeChanges } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { getAnnotationPrompt, setPromptDirectory } from "./prompt-loader.js";
import { toCompactAst } from "./ast/compact-format.js";
import { CliOptions } from "./types.js";
import { processFilesConcurrent } from "./pipeline.js";

/** Режимы аннотирования */
type AnnotationMode = 'copy' | 'inplace';

/**
 * Создаёт строгий промпт для повторных попыток аннотации.
 * Warnings добавляются к оригинальному промпту один раз, без накопления.
 */
function makePromptStrict(originalPrompt: string, attemptNumber: number): string {
  const warnings = [
    `=== ПОПЫТКА ${attemptNumber}/3 — СТРОГОЕ ПРЕДУПРЕЖДЕНИЕ ===`,
    "НЕ ИЗМЕНЯЙ исходный код! НЕ СОКРАЩАЙ через (...)!",
    "НЕ УДАЛЯЙ/ОБРЕЗАЙ части кода! ВЕРНИ ПОЛНЫЙ КОД с комментариями!",
    "Запрещено: менять JSX/пропсы/состояние/импорты/экспорты, добавлять eslint-disable",
    "Разрешено: только добавлять JSDoc /** */ перед функциями + @fileoverview",
    "=== КОНЕЦ ПРЕДУПРЕЖДЕНИЯ ===\n",
  ];

  return warnings.join("\n") + originalPrompt;
}

/**
 * Общая логика аннотирования React компонентов
 * @param opts - Опции командной строки
 * @param mode - Режим: 'copy' (в выходную папку) или 'inplace' (прямо в файлы)
 */
async function annotateFiles(opts: CliOptions, mode: AnnotationMode): Promise<void> {
  try {
    // Применяем кастомную директорию промптов если указана
    if (opts.promptDir) {
      setPromptDirectory(opts.promptDir);
    }

    const files: string[] = await getFiles(opts.src, opts.extensions);
    const modeLabel = mode === 'copy' ? 'Annotation (copy)' : 'Annotation (in-place)';

    if (opts.dryRun) {
      console.log(`\n🧪 [DRY RUN] ${modeLabel}: ${files.length} files`);

      let skipped = 0;
      let processed = 0;
      for (const file of files) {
        const code = readFile(file);
        if (!opts.force && hasFileoverview(code)) {
          console.log(`  ⏭️ [SKIP] has @fileoverview: ${file}`);
          skipped++;
        } else {
          console.log(`  ✓ Would annotate: ${file}`);
          processed++;
        }
      }
      console.log(`\n🧪 Dry-run: ${processed} would process, ${skipped} would skip`);
      return;
    }

    await processFilesConcurrent(files, async (file, index, total) => {
      const code: string = readFile(file);

      // Пропускаем файлы с @fileoverview если не указан --force
      if (!opts.force && hasFileoverview(code)) {
        return { file, success: true, skipped: true, skipReason: "has @fileoverview" };
      }

      // Извлекаем структурную информацию через AST
      const astInfo = extractComponentInfo(code);

      // Skip файлы без полезного содержимого (barrel files, пустые, re-exports only)
      if (astInfo.fileType === "skip") {
        return { file, success: true, skipped: true, skipReason: "no-content" };
      }

      // Формируем детальный промпт для LLM
      const prompt = getAnnotationPrompt(astInfo, code);

      // Генерируем код с проверкой изменений (максимум 3 попытки)
      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let annotated: string | null = null;

      while (attempts < MAX_ATTEMPTS) {
        try {
          // На 0-й попытке — оригинальный промпт, на последующих — строгий
          const currentPrompt = attempts === 0
            ? prompt
            : makePromptStrict(prompt, attempts + 1);
          const result: string = await callLlm(opts, currentPrompt);

          // Проверяем, изменился ли код (игнорируя комментарии)
          if (!hasCodeChanges(code, result)) {
            annotated = result;
            break;
          }

          attempts++;
          if (attempts === MAX_ATTEMPTS) {
            return {
              file,
              success: false,
              error: `Code changes detected after ${MAX_ATTEMPTS} attempts (original: ${code.length}, result: ${result.length})`,
            };
          }
        } catch (error) {
          attempts++;
          if (attempts === MAX_ATTEMPTS) {
            return {
              file,
              success: false,
              error: `LLM error after ${MAX_ATTEMPTS} attempts: ${(error as Error)?.message ?? error}`,
            };
          }
        }
      }

      if (!annotated) {
        return { file, success: false, error: "Annotation returned null" };
      }

      // Записываем результат
      if (mode === 'copy') {
        const outPath = writeOutput(opts.out + "/annotated", file, annotated);
        return { file, success: true, outputPath: outPath };
      }

      writeInPlace(file, annotated);
      return { file, success: true, outputPath: file };
    }, opts, modeLabel);
  } catch (error) {
    console.error("❌ Ошибка при аннотировании:", error);
    throw error;
  }
}

/**
 * Выполняет аннотирование проекта React компонентов в выходную директорию
 */
export async function annotateProject(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'copy');
}

/**
 * Выполняет аннотирование файлов непосредственно в исходных файлах (in-place)
 */
export async function annotateInPlace(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'inplace');
}
